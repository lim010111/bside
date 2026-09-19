from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    redis_url: str = "redis://127.0.0.1:6379/0"

    cors_origins: list[str] = [
        # Vite dev server.
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        # The Capacitor WebView. Its origin is the androidScheme from
        # web/capacitor.config.json, not the API's own host, so the APK fails CORS
        # preflight without this. Found by running the built APK against the server.
        "https://localhost",
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

    # Push notifications. Absent configuration is a supported state: the server
    # runs unchanged and simply never pushes, which is what a local or a
    # test deployment wants.
    fcm_credentials_file: str | None = None
    """Path to the Firebase service account JSON. Never inside the image."""

    fcm_project_id: str | None = None
    """Overrides the project in the key file. Normally left unset."""

    recommendation_notice_ttl_seconds: int = 21600
    """How long one viewer-candidate pair stays notified-about. Six hours: an
    event runs a day, and being told about the same person twice in it is
    worse than being told once."""

    def fcm_missing_configuration(self) -> tuple[str, ...]:
        """What is needed before any push is possible."""
        return () if self.fcm_credentials_file else ("FCM_CREDENTIALS_FILE",)
