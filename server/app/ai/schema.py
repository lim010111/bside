"""Strict parsing of one model-produced evaluation entry.

Separate from the public DTOs: what the model returns is a claim, not a result.
Anything that does not fit this shape becomes a failed candidate rather than a
silently repaired recommendation.

The scalar types are strict on purpose. Lax coercion would let ``"0.9"`` or
``"yes"`` become a confident score or a cleared intent conflict, so a model that
returns the wrong JSON type fails the entry instead.
"""

from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictFloat,
    StrictInt,
    StrictStr,
)

from app.ai.models import ExcerptSource


class RawExcerpt(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source: ExcerptSource
    quote: StrictStr = Field(min_length=1)


class RawEvaluation(BaseModel):
    model_config = ConfigDict(extra="ignore")

    candidate_id: StrictStr = Field(min_length=1)
    status: StrictStr
    score: StrictFloat | StrictInt | None = None
    reason: StrictStr | None = None
    intent_conflict: StrictBool = False
    evidence: list[RawExcerpt] = Field(default_factory=list)


_SOURCES = {
    "vs": "viewer_self_description",
    "vi": "viewer_connection_intent",
    "cs": "candidate_self_description",
    "ci": "candidate_connection_intent",
}


class CompactEvaluation(BaseModel):
    """Transport compression only; the same claims still pass the same checks."""

    model_config = ConfigDict(extra="forbid")

    id: StrictStr = Field(min_length=1)
    t: Literal["ok", "insufficient"]
    s: StrictFloat | StrictInt | None
    r: StrictStr | None
    c: StrictBool
    e: list[tuple[Literal["vs", "vi", "cs", "ci"], StrictStr]]


def parse_evaluation(raw) -> RawEvaluation:
    # Legacy responses remain usable by injected prompt providers and replays.
    # Compact objects forbid extra keys so mixed/ambiguous representations fail.
    if not isinstance(raw, dict) or "id" not in raw:
        return RawEvaluation.model_validate(raw)
    compact = CompactEvaluation.model_validate(raw)
    return RawEvaluation(
        candidate_id=compact.id,
        status="evaluated" if compact.t == "ok" else "insufficient_evidence",
        score=compact.s,
        reason=compact.r,
        intent_conflict=compact.c,
        evidence=[RawExcerpt(source=_SOURCES[source], quote=quote) for source, quote in compact.e],
    )
