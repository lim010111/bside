"""Request and response models mirroring docs/openapi.yaml.

Every model forbids unknown fields, because the contract says the server rejects
JSON fields it does not know. Lengths count Unicode code points, which is what
Python string length already means.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

Nickname = Annotated[str, Field(min_length=1, max_length=20)]
FreeText = Annotated[str, Field(min_length=1, max_length=500)]
MessageText = Annotated[str, Field(min_length=1, max_length=2000)]
Identifier = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{22}$")]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class InstallationRequest(Strict):
    installation_request_id: UUID
    platform: Literal["android"]


class InstallationResponse(Strict):
    user_id: UUID
    installation_credential: str
    created_at: str


class PublicProfile(Strict):
    nickname: Nickname
    self_description: FreeText
    connection_intent: FreeText


class MeResponse(Strict):
    user_id: UUID
    profile: PublicProfile | None
    discovery_enabled: bool


class DiscoveryStateRequest(Strict):
    enabled: bool


class DiscoveryStateResponse(Strict):
    discovery_enabled: bool


class DiscoveryIdentifierResponse(Strict):
    identifier: Identifier
    issued_at: str
    refresh_after: str
    expires_at: str


class ObservationRequest(Strict):
    identifiers: Annotated[list[Identifier], Field(min_length=1, max_length=50)]


class Recommendation(Strict):
    """What the viewer is told about one candidate.

    The four evaluated states are not interchangeable. 'unscored' means the
    evaluation ran and found no specific connection worth naming, which is
    neither a failure nor a low score; 'pending' means it has not run yet;
    'unavailable' means the server has no AI configured at all.

    `rank` orders the list and is not a score. Numeric scores, the excerpts the
    reason was grounded in, and the model identity stay server-side.
    """

    status: Literal["ready", "pending", "unscored", "failed", "unavailable"]
    rank: Annotated[int, Field(ge=0)] | None = None
    reason: Annotated[str, Field(min_length=1, max_length=400)] | None = None


class ObservedUser(Strict):
    user_id: UUID
    profile: PublicProfile
    recommendation: Recommendation
    last_seen_at: str
    conversation_eligibility_expires_at: str


class ObservationResponse(Strict):
    observed_users: list[ObservedUser]


class CreateMessageRequest(Strict):
    recipient_id: UUID
    client_message_id: UUID
    text: MessageText


class Message(Strict):
    message_id: UUID
    conversation_id: UUID
    sender_id: UUID
    recipient_id: UUID
    seq: Annotated[int, Field(ge=1)]
    text: MessageText
    created_at: str


class ConversationParticipant(Strict):
    user_id: UUID
    profile: PublicProfile


class ConversationSummary(Strict):
    conversation_id: UUID
    participant: ConversationParticipant
    last_message: Message


class ConversationListResponse(Strict):
    conversations: list[ConversationSummary]


class MessagePage(Strict):
    messages: list[Message]
    next_after_seq: Annotated[int, Field(ge=1)] | None
    has_more: bool
