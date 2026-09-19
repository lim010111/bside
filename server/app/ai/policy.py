"""Notification eligibility.

Eligibility only marks a candidate as worth an out-of-app recommendation
notification. It never removes anyone from the candidate list, and it is not
authorisation: the server still rechecks revisions, discovery participation,
observation validity and notification de-duplication immediately before
publishing anything.

The threshold is UNCALIBRATED. It is a deliberately conservative placeholder
chosen before any live evaluation, and the same number does not mean the same
notification quality on a different model.
"""

from dataclasses import dataclass

from app.ai.grounding import CANDIDATE_SOURCES, VIEWER_SOURCES, has_verified
from app.ai.models import CandidateRecommendation, EvaluationStatus, ExcerptSource


@dataclass(frozen=True)
class NotificationDecision:
    eligible: bool
    reason: str


@dataclass(frozen=True)
class NotificationPolicy:
    """Adjustable hyper-parameters for notification eligibility."""

    version: str
    score_threshold: float
    require_mutual_evidence: bool = True
    require_intent_evidence: bool = True
    max_per_request: int = 3

    def evaluate(self, item: CandidateRecommendation) -> NotificationDecision:
        """Decide one candidate on its own merits, never by its rank.

        Being ranked first is not a reason on its own: a viewer whose nearby
        candidates are all weak still has a top-1.
        """
        if item.status is not EvaluationStatus.EVALUATED:
            return NotificationDecision(False, f"status_{item.status.value}")
        if item.intent_conflict:
            return NotificationDecision(False, "intent_conflict")
        if item.score is None:
            return NotificationDecision(False, "missing_score")
        if item.score < self.score_threshold:
            return NotificationDecision(False, "below_threshold")
        if not item.reason:
            return NotificationDecision(False, "missing_reason")
        if item.has_unverified_excerpts:
            # A quote we could not find in the original text may be carrying the
            # part of the reason that made this look worth interrupting someone
            # for. The rest of the excerpts do not vouch for it.
            return NotificationDecision(False, "unverified_excerpt")
        if self.require_mutual_evidence:
            # Each side's own words must support the connection. This is not a
            # requirement that both sides benefit equally.
            if not has_verified(item.excerpts, VIEWER_SOURCES):
                return NotificationDecision(False, "no_verified_viewer_evidence")
            if not has_verified(item.excerpts, CANDIDATE_SOURCES):
                return NotificationDecision(False, "no_verified_candidate_evidence")
        if self.require_intent_evidence:
            # Conservative default: an unprompted notification needs a verified
            # excerpt from both supplied connection intents. A participant who
            # left their intent empty therefore stays in the list but is never
            # notified about until this flag is relaxed.
            if not has_verified(
                item.excerpts, {ExcerptSource.VIEWER_CONNECTION_INTENT}
            ):
                return NotificationDecision(False, "no_verified_viewer_intent")
            if not has_verified(
                item.excerpts, {ExcerptSource.CANDIDATE_CONNECTION_INTENT}
            ):
                return NotificationDecision(False, "no_verified_candidate_intent")
        return NotificationDecision(True, "eligible")

    def apply(
        self, items: tuple[CandidateRecommendation, ...]
    ) -> tuple[CandidateRecommendation, ...]:
        """Mark eligibility across an ordered result, honouring the cap."""
        marked: list[CandidateRecommendation] = []
        allowed = self.max_per_request
        for item in items:
            decision = self.evaluate(item)
            eligible = decision.eligible and allowed > 0
            if eligible:
                allowed -= 1
            marked.append(item.model_copy(update={"notification_eligible": eligible}))
        return tuple(marked)
