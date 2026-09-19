from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    redis_url: str = "redis://127.0.0.1:6379/0"

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # Implementation defaults from docs/api-contract.md v0.1. They are configuration,
    # not user-confirmed numbers, and the first real-device run records what was used.
    identifier_ttl_seconds: int = 300
    """A BLE temporary identifier is valid for five minutes."""

    identifier_refresh_after_seconds: int = 240
    """Rotation is allowed at or after four minutes, leaving a one-minute overlap."""

    observation_eligibility_seconds: int = 600
    """A server-received observation grants first-conversation eligibility this long."""

    installation_replay_seconds: int = 600
    """A registration credential is replayable for ten minutes, then the key expires."""

    max_observation_identifiers: int = 50
    """Identifiers accepted in one observation report."""
