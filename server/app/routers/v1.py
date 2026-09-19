"""The API v0.1 endpoints from docs/openapi.yaml, mounted under /api/v1."""

from uuid import UUID

from fastapi import APIRouter, Query, Response, status

from app.deps import CurrentUser, StoreDep
from app.errors import ApiError
from app.models import (
    ConversationListResponse,
    CreateMessageRequest,
    DiscoveryIdentifierResponse,
    DiscoveryStateRequest,
    DiscoveryStateResponse,
    InstallationRequest,
    InstallationResponse,
    MeResponse,
    Message,
    MessagePage,
    ObservationRequest,
    ObservationResponse,
    PublicProfile,
)

router = APIRouter(prefix="/api/v1")


@router.post(
    "/installations",
    response_model=InstallationResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Installations"],
)
async def create_installation(body: InstallationRequest, store: StoreDep, response: Response):
    outcome, payload = await store.register_installation(str(body.installation_request_id), body.platform)
    if outcome == "conflict":
        raise ApiError(
            status.HTTP_409_CONFLICT,
            "IDEMPOTENCY_CONFLICT",
            "The same installation_request_id was used with different content.",
        )
    if outcome == "expired":
        raise ApiError(
            status.HTTP_409_CONFLICT,
            "IDEMPOTENCY_REPLAY_EXPIRED",
            "The credential for this installation_request_id is no longer replayable.",
        )
    if outcome == "replayed":
        response.status_code = status.HTTP_200_OK
    return InstallationResponse(**{k: v for k, v in payload.items() if k != "platform"})


@router.get("/me", response_model=MeResponse, tags=["Me"])
async def get_me(user_id: CurrentUser, store: StoreDep):
    user = await store.get_user(user_id)
    return MeResponse(
        user_id=user_id,
        profile=store.profile_of(user),
        discovery_enabled=user.get("discovery_enabled") == "1",
    )


@router.post("/me/profile", response_model=PublicProfile, tags=["Me"])
async def put_profile(body: PublicProfile, user_id: CurrentUser, store: StoreDep):
    # A full replace. Submitting identical values changes nothing and still succeeds.
    return await store.put_profile(user_id, body.model_dump())


@router.post("/me/discovery", response_model=DiscoveryStateResponse, tags=["Me"])
async def set_discovery(body: DiscoveryStateRequest, user_id: CurrentUser, store: StoreDep):
    enabled = await store.set_discovery(user_id, body.enabled)
    return DiscoveryStateResponse(discovery_enabled=enabled)


@router.post("/discovery/identifiers", response_model=DiscoveryIdentifierResponse, tags=["Discovery"])
async def issue_identifier(user_id: CurrentUser, store: StoreDep):
    outcome, identifier = await store.issue_identifier(user_id)
    if outcome == "PROFILE_REQUIRED":
        raise ApiError(status.HTTP_409_CONFLICT, "PROFILE_REQUIRED", "A complete profile is required.")
    if outcome == "DISCOVERY_DISABLED":
        raise ApiError(status.HTTP_409_CONFLICT, "DISCOVERY_DISABLED", "Discovery is turned off.")
    return DiscoveryIdentifierResponse(**identifier)


@router.post("/discovery/observations", response_model=ObservationResponse, tags=["Discovery"])
async def report_observations(body: ObservationRequest, user_id: CurrentUser, store: StoreDep):
    user = await store.get_user(user_id)
    if store.profile_of(user) is None:
        raise ApiError(status.HTTP_409_CONFLICT, "PROFILE_REQUIRED", "A complete profile is required.")
    if user.get("discovery_enabled") != "1":
        # Not advertising means not collecting either. An empty result, not an error:
        # the client may still have a scan in flight while the user turns discovery off.
        return ObservationResponse(observed_users=[])
    return ObservationResponse(observed_users=await store.report_observations(user_id, body.identifiers))


@router.get("/conversations", response_model=ConversationListResponse, tags=["Chat"])
async def list_conversations(user_id: CurrentUser, store: StoreDep):
    return ConversationListResponse(conversations=await store.list_conversations(user_id))


_SEND_FAILURES = {
    "IDEMPOTENCY_CONFLICT": (
        status.HTTP_409_CONFLICT,
        "The same client_message_id was used with a different recipient or text.",
    ),
    "PROFILE_REQUIRED": (status.HTTP_409_CONFLICT, "Both users need a complete profile."),
    "DISCOVERY_DISABLED": (status.HTTP_403_FORBIDDEN, "Both users need discovery enabled."),
    "OBSERVATION_REQUIRED": (status.HTTP_403_FORBIDDEN, "A recent observation of the recipient is required."),
    "RECIPIENT_NOT_FOUND": (status.HTTP_404_NOT_FOUND, "The recipient does not exist."),
}


@router.post("/messages", response_model=Message, status_code=status.HTTP_201_CREATED, tags=["Chat"])
async def create_message(body: CreateMessageRequest, user_id: CurrentUser, store: StoreDep, response: Response):
    if str(body.recipient_id) == user_id:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "VALIDATION_ERROR",
            "A message cannot be sent to yourself.",
            {"field": "recipient_id"},
        )
    result = await store.send_message(user_id, str(body.recipient_id), str(body.client_message_id), body.text)
    if result.status in _SEND_FAILURES:
        code, message = _SEND_FAILURES[result.status]
        raise ApiError(code, result.status, message)
    if result.status == "REPLAYED":
        response.status_code = status.HTTP_200_OK
    return Message(**result.message)


@router.get("/conversations/{conversation_id}/messages", response_model=MessagePage, tags=["Chat"])
async def list_messages(
    conversation_id: UUID,
    user_id: CurrentUser,
    store: StoreDep,
    after_seq: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    page = await store.get_messages(user_id, str(conversation_id), after_seq, limit)
    if page is None:
        # Missing and non-participant conversations are the same answer, so the API
        # does not tell a stranger that a conversation exists.
        raise ApiError(status.HTTP_404_NOT_FOUND, "CONVERSATION_NOT_FOUND", "The conversation was not found.")
    return MessagePage(**page)
