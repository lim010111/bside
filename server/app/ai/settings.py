"""Configuration for the AI recommendation module.

Kept in its own settings class (``AI_`` prefixed environment variables) so the
API team's ``app.config.Settings`` stays untouched. Every number below is an
implementation default chosen before any live measurement, not a user decision
and not a verified value.
"""

from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# ``server/.env``. Resolved from this file so the module loads the same
# configuration whether it is used from ``server/`` or from a worker elsewhere.
SERVER_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class AISettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AI_",
        env_file=(SERVER_ENV_FILE, ".env"),
        extra="ignore",
        protected_namespaces=(),
    )

    # Gateway. No default model: guessing one would claim an untested capability.
    api_key: SecretStr | None = None
    base_url: str | None = None
    model: str | None = None
    chat_completions_path: str = "/chat/completions"
    use_json_response_format: bool = True

    # Timeouts and pacing. ``total_timeout_seconds`` bounds the whole request,
    # including batches still queued behind the concurrency limit.
    connect_timeout_seconds: float = 5.0
    request_timeout_seconds: float = 20.0
    total_timeout_seconds: float = 45.0
    max_attempts: int = Field(default=1, ge=1)
    max_concurrent_requests: int = Field(default=4, ge=1)
    batch_size: int = Field(default=5, ge=1)

    # Inference. Low temperature for repeatable evaluations.
    temperature: float = 0.2
    # Output budget. A 5-candidate batch was observed hitting
    # finish_reason="length" at 1400 tokens, which loses the whole batch, so the
    # ceiling is far higher and the batch is sized to fit inside it. The two
    # per-batch numbers are estimates, not measurements.
    max_output_tokens: int = Field(default=4096, ge=1)
    output_tokens_per_candidate: int = Field(default=400, ge=1)
    output_tokens_overhead: int = Field(default=256, ge=0)
    # Supported input size per participant field. Inputs longer than this are
    # rejected per candidate, never truncated: a negation or a qualifier past
    # the cut would otherwise silently become a positive recommendation.
    max_field_chars: int = Field(default=2000, ge=1)
    max_reason_chars: int = Field(default=220, ge=1)
    # An excerpt shorter than this cannot ground anything: "." is a substring of
    # every profile and would otherwise satisfy the whole notification gate.
    min_excerpt_chars: int = Field(default=6, ge=1)

    # Cache identity and lifetime.
    cache_namespace: str = "ai:rec:v1"
    cache_ttl_seconds: int = Field(default=900, ge=1)

    # Notification eligibility. UNCALIBRATED: this threshold is a conservative
    # placeholder and stays so until live evaluation compares false positives
    # and misses per model. It never removes anyone from the candidate list.
    policy_version: str = "ai-policy-2026-09-20-uncalibrated"
    notification_score_threshold: float = Field(default=0.72, ge=0.0, le=1.0)
    notification_require_mutual_evidence: bool = True
    notification_require_intent_evidence: bool = True
    notification_max_per_request: int = Field(default=3, ge=0)

    def effective_batch_size(self) -> int:
        """``batch_size``, reduced so one batch's answer fits the budget."""
        room = self.max_output_tokens - self.output_tokens_overhead
        affordable = max(1, room // self.output_tokens_per_candidate)
        return min(self.batch_size, affordable)

    def missing_configuration(self) -> tuple[str, ...]:
        """Names of the settings needed before any provider call is possible."""
        missing = []
        if self.api_key is None or not self.api_key.get_secret_value():
            missing.append("AI_API_KEY")
        if not self.base_url:
            missing.append("AI_BASE_URL")
        if not self.model:
            missing.append("AI_MODEL")
        return tuple(missing)
