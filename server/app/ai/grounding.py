"""Checks a model's supporting excerpts against the original participant text.

The model claiming a quote is not evidence that the quote exists. Each excerpt
is looked up in the field it names, on the viewer or candidate as appropriate.
Whitespace is normalised because JSON round-trips and line wrapping change it;
nothing else is relaxed, so a paraphrase does not verify.
"""

import re

from app.ai.models import ExcerptSource, GroundingExcerpt, ParticipantProfile

_WHITESPACE = re.compile(r"\s+")
_CONTENT = re.compile(r"\w", re.UNICODE)

MIN_EXCERPT_CHARS = 6

VIEWER_SOURCES = frozenset(
    {ExcerptSource.VIEWER_SELF_DESCRIPTION, ExcerptSource.VIEWER_CONNECTION_INTENT}
)
CANDIDATE_SOURCES = frozenset(
    {
        ExcerptSource.CANDIDATE_SELF_DESCRIPTION,
        ExcerptSource.CANDIDATE_CONNECTION_INTENT,
    }
)
INTENT_SOURCES = frozenset(
    {ExcerptSource.VIEWER_CONNECTION_INTENT, ExcerptSource.CANDIDATE_CONNECTION_INTENT}
)


def normalise(text: str) -> str:
    return _WHITESPACE.sub(" ", text).strip().casefold()


def content_length(text: str) -> int:
    """Letters and digits only. Punctuation grounds nothing."""
    return len(_CONTENT.findall(text))


def source_text(
    source: ExcerptSource, viewer: ParticipantProfile, candidate: ParticipantProfile
) -> str:
    match source:
        case ExcerptSource.VIEWER_SELF_DESCRIPTION:
            return viewer.self_description
        case ExcerptSource.VIEWER_CONNECTION_INTENT:
            return viewer.connection_intent
        case ExcerptSource.CANDIDATE_SELF_DESCRIPTION:
            return candidate.self_description
        case ExcerptSource.CANDIDATE_CONNECTION_INTENT:
            return candidate.connection_intent
    raise AssertionError(f"unhandled excerpt source {source!r}")


def verify_excerpt(
    source: ExcerptSource,
    quote: str,
    viewer: ParticipantProfile,
    candidate: ParticipantProfile,
    min_chars: int = MIN_EXCERPT_CHARS,
) -> bool:
    """Whether this exact quote occurs in the field it names.

    Guarantees only that: a verbatim occurrence, up to whitespace and case, of
    something long enough to carry meaning. ``"."`` is a substring of nearly
    every profile, so a quote that thin is treated as no evidence at all.
    Nothing here checks that the reason follows from the quote.
    """
    normalised_quote = normalise(quote)
    if content_length(normalised_quote) < min_chars:
        return False
    return normalised_quote in normalise(source_text(source, viewer, candidate))


def verify_excerpts(
    excerpts: tuple[GroundingExcerpt, ...],
    viewer: ParticipantProfile,
    candidate: ParticipantProfile,
    min_chars: int = MIN_EXCERPT_CHARS,
) -> tuple[GroundingExcerpt, ...]:
    """Recompute ``verified`` for every excerpt against the live text."""
    return tuple(
        excerpt.model_copy(
            update={
                "verified": verify_excerpt(
                    excerpt.source, excerpt.quote, viewer, candidate, min_chars
                )
            }
        )
        for excerpt in excerpts
    )


def has_verified(excerpts: tuple[GroundingExcerpt, ...], sources) -> bool:
    return any(
        excerpt.verified and excerpt.source in sources for excerpt in excerpts
    )
