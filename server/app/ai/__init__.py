"""AI recommendation module.

Independent of the HTTP layer: the API owns who may be evaluated and whether a
result may be shown or notified about. This package turns an authorised viewer
and candidate set into a ranked, grounded evaluation for every candidate.

See ``server/docs/ai.md`` for the integration example, configuration and limits.
"""

from app.ai.cache import (
    InMemoryRecommendationCache,
    NullRecommendationCache,
    RecommendationCache,
    RedisRecommendationCache,
    build_cache_key,
    build_inference_digest,
)
from app.ai.errors import (
    AIConfigurationError,
    AIError,
    AIGatewayError,
    AIGatewayHTTPError,
    AIInputError,
    AIResponseError,
    AIResponseTruncatedError,
    AITimeoutError,
)
from app.ai.gateway import ChatGateway, OpenAICompatibleGateway
from app.ai.models import (
    CandidateRecommendation,
    EvaluationStatus,
    ExcerptSource,
    FailureCode,
    GroundingExcerpt,
    ParticipantProfile,
    RecommendationRequest,
    RecommendationResult,
    TokenUsage,
)
from app.ai.policy import NotificationDecision, NotificationPolicy
from app.ai.prompt import SYSTEM_INSTRUCTIONS, DefaultPromptProvider, PromptProvider
from app.ai.service import (
    RecommendationService,
    matches_current_inputs,
    pending_result,
    stale_candidate_ids,
)
from app.ai.settings import AISettings

__all__ = [
    "SYSTEM_INSTRUCTIONS",
    "AIConfigurationError",
    "AIError",
    "AIGatewayError",
    "AIGatewayHTTPError",
    "AIInputError",
    "AIResponseError",
    "AIResponseTruncatedError",
    "AISettings",
    "AITimeoutError",
    "CandidateRecommendation",
    "ChatGateway",
    "DefaultPromptProvider",
    "EvaluationStatus",
    "ExcerptSource",
    "FailureCode",
    "GroundingExcerpt",
    "InMemoryRecommendationCache",
    "NotificationDecision",
    "NotificationPolicy",
    "NullRecommendationCache",
    "OpenAICompatibleGateway",
    "ParticipantProfile",
    "PromptProvider",
    "RecommendationCache",
    "RecommendationRequest",
    "RecommendationResult",
    "RecommendationService",
    "RedisRecommendationCache",
    "TokenUsage",
    "build_cache_key",
    "build_inference_digest",
    "matches_current_inputs",
    "pending_result",
    "stale_candidate_ids",
]
