"""Public immutable DTOs for the AI recommendation module.

The server owns who may be evaluated; this module only ranks and explains the
candidates it is handed. It never creates a candidate identity and never
changes a supplied ``profile_revision``.
"""

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.ai.errors import AIInputError


class EvaluationStatus(StrEnum):
    """Why a candidate looks the way it does. These are not interchangeable."""

    EVALUATED = "evaluated"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"
    FAILED = "failed"
    PENDING = "pending"


class ExcerptSource(StrEnum):
    """Which original field an excerpt claims to quote."""

    VIEWER_SELF_DESCRIPTION = "viewer_self_description"
    VIEWER_CONNECTION_INTENT = "viewer_connection_intent"
    CANDIDATE_SELF_DESCRIPTION = "candidate_self_description"
    CANDIDATE_CONNECTION_INTENT = "candidate_connection_intent"


class FailureCode(StrEnum):
    """Distinguishes the ways an evaluation can fail to produce a result."""

    CONFIGURATION_MISSING = "configuration_missing"
    GATEWAY_TIMEOUT = "gateway_timeout"
    GATEWAY_HTTP_ERROR = "gateway_http_error"
    GATEWAY_NETWORK_ERROR = "gateway_network_error"
    INVALID_JSON = "invalid_json"
    SCHEMA_MISMATCH = "schema_mismatch"
    MISSING_IN_RESPONSE = "missing_in_response"
    INPUT_TOO_LONG = "input_too_long"
    DUPLICATE_IN_RESPONSE = "duplicate_in_response"
    UNGROUNDED_REASON = "ungrounded_reason"
    OUTPUT_TRUNCATED = "output_truncated"
    CANCELLED = "cancelled"


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class ParticipantProfile(_Frozen):
    """A snapshot of one participant's own words at a known input revision."""

    user_id: str = Field(min_length=1)
    self_description: str = ""
    connection_intent: str = ""
    profile_revision: int = Field(ge=0)


class RecommendationRequest(_Frozen):
    """One viewer and the candidates the server already authorised for them."""

    viewer: ParticipantProfile
    candidates: tuple[ParticipantProfile, ...] = ()

    @model_validator(mode="after")
    def _reject_ambiguous_candidates(self) -> "RecommendationRequest":
        # Silently de-duplicating would drop a participant the server expects
        # back, so refuse instead and let the caller fix the input.
        seen: set[str] = set()
        for candidate in self.candidates:
            if candidate.user_id == self.viewer.user_id:
                raise AIInputError(
                    f"viewer {self.viewer.user_id!r} is also listed as a candidate"
                )
            if candidate.user_id in seen:
                raise AIInputError(f"duplicate candidate user_id {candidate.user_id!r}")
            seen.add(candidate.user_id)
        return self

    def candidate_by_id(self, user_id: str) -> ParticipantProfile | None:
        for candidate in self.candidates:
            if candidate.user_id == user_id:
                return candidate
        return None


class GroundingExcerpt(_Frozen):
    """An excerpt the model offered as support, plus whether we found it.

    ``verified`` is our own check against the original field, never the model's
    claim about itself. What it guarantees is narrow: the quote occurs verbatim
    in the named field, up to whitespace and case. It says nothing about whether
    the reason follows from the quote.
    """

    source: ExcerptSource
    quote: str
    verified: bool


class CandidateRecommendation(_Frozen):
    """The per-candidate outcome. Present for every supplied candidate."""

    candidate_user_id: str
    status: EvaluationStatus
    rank: int = Field(ge=0)
    score: float | None = Field(default=None, ge=0.0, le=1.0)
    reason: str | None = None
    excerpts: tuple[GroundingExcerpt, ...] = ()
    intent_conflict: bool = False
    notification_eligible: bool = False
    failure_code: FailureCode | None = None
    viewer_profile_revision: int = Field(ge=0)
    candidate_profile_revision: int = Field(ge=0)
    from_cache: bool = False

    @property
    def verified_excerpts(self) -> tuple[GroundingExcerpt, ...]:
        """The only excerpts that may be shown to a user as 원문 근거."""
        return tuple(excerpt for excerpt in self.excerpts if excerpt.verified)

    @property
    def has_unverified_excerpts(self) -> bool:
        return any(not excerpt.verified for excerpt in self.excerpts)


class TokenUsage(_Frozen):
    """Token counts the provider reported for one ``recommend()`` call.

    Scoped to that call: concurrent requests sharing one service and one client
    never mix. ``None`` means the provider did not report that field, which is
    not the same as zero. ``complete`` is true only when every provider request
    this call made came back with usage, so a partial number is never read as a
    full accounting. A call that reached no provider at all - served from cache,
    missing configuration, oversized input - reports zeros and ``complete``.

    These are the provider's own numbers, not a price. No cost is derived here.
    """

    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    total_tokens: int | None = Field(default=None, ge=0)
    complete: bool = False
    reported_calls: int = Field(default=0, ge=0)
    provider_calls: int = Field(default=0, ge=0)

    @classmethod
    def nothing_sent(cls) -> "TokenUsage":
        """No provider request was made, so zero really is the measurement."""
        return cls(
            input_tokens=0,
            output_tokens=0,
            total_tokens=0,
            complete=True,
            reported_calls=0,
            provider_calls=0,
        )


class RecommendationResult(_Frozen):
    """Every supplied candidate, ordered, with the metadata that produced it."""

    viewer_user_id: str
    viewer_profile_revision: int = Field(ge=0)
    recommendations: tuple[CandidateRecommendation, ...] = ()
    policy_version: str
    model: str | None = None
    prompt_digest: str | None = None
    inference_digest: str | None = None
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    anomalies: tuple[str, ...] = ()
    cache_hits: int = 0
    gateway_calls: int = 0
    usage: TokenUsage = Field(default_factory=TokenUsage.nothing_sent)
    duration_ms: float = 0.0

    def by_candidate_id(self, user_id: str) -> CandidateRecommendation | None:
        for item in self.recommendations:
            if item.candidate_user_id == user_id:
                return item
        return None

    @property
    def notification_candidate_ids(self) -> tuple[str, ...]:
        return tuple(
            item.candidate_user_id
            for item in self.recommendations
            if item.notification_eligible
        )
