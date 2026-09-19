"""Test fixtures that talk to a real Redis.

The atomic send path is a Lua script, so a stub would not exercise the thing most
worth testing. Tests run against the Compose Redis on a scratch database that is
flushed before each test, never against database 0.

    docker compose up -d --wait redis
    uv run pytest
"""

import os
from functools import partial
from uuid import uuid4

import pytest
import redis as sync_redis
from fastapi.testclient import TestClient

# CREDENTIAL_REPLAY_SECRET has no default, on purpose: a shipped default secret is
# worse than a missing one. That makes it required here too, and `app.main` builds
# an app at import time, so it has to be set before that import rather than in a
# fixture. Setting it here also keeps the suite from depending on a developer's
# own server/.env, which is what it was quietly doing.
os.environ.setdefault("CREDENTIAL_REPLAY_SECRET", "test-only-credential-replay-secret")

from app.ai import AISettings  # noqa: E402
from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.recommendations import build_recommendations  # noqa: E402

SCRATCH_URL = os.environ.get("TEST_REDIS_URL", "redis://127.0.0.1:6379/15")


@pytest.fixture
def settings() -> Settings:
    return Settings(_env_file=None, redis_url=SCRATCH_URL)


@pytest.fixture
def flush(settings: Settings):
    client = sync_redis.from_url(settings.redis_url, socket_connect_timeout=2)
    try:
        client.ping()
    except (sync_redis.exceptions.RedisError, OSError):  # pragma: no cover
        pytest.skip("Redis is not running: docker compose up -d --wait redis")
    client.flushdb()
    yield
    client.flushdb()
    client.close()


@pytest.fixture
def client(settings: Settings, flush, monkeypatch):
    # API Settings(_env_file=None) does not disable the independent AISettings.
    # A developer's server/.env must never enable paid background jobs here.
    # Recommendation boundary tests inject their own offline bridge afterwards.
    monkeypatch.setattr(
        "app.main.build_recommendations",
        partial(build_recommendations, settings=AISettings(
            _env_file=None, api_key=None, base_url=None, model=None,
        )),
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client


class Installation:
    """A registered installation with its own headers."""

    def __init__(self, client: TestClient, user_id: str, credential: str) -> None:
        self.client = client
        self.user_id = user_id
        self.headers = {"Authorization": f"Bearer {credential}"}

    def get(self, path: str, **kwargs):
        return self.client.get(path, headers=self.headers, **kwargs)

    def post(self, path: str, **kwargs):
        return self.client.post(path, headers=self.headers, **kwargs)

    def profile(self, nickname: str = "테스터") -> "Installation":
        response = self.post(
            "/api/v1/me/profile",
            json={
                "nickname": nickname,
                "self_description": f"{nickname}의 자기소개입니다",
                "connection_intent": f"{nickname}가 만나고 싶은 사람입니다",
            },
        )
        assert response.status_code == 200, response.text
        return self

    def discovery(self, enabled: bool = True) -> "Installation":
        response = self.post("/api/v1/me/discovery", json={"enabled": enabled})
        assert response.status_code == 200, response.text
        return self

    def identifier(self) -> str:
        response = self.post("/api/v1/discovery/identifiers")
        assert response.status_code == 200, response.text
        return response.json()["identifier"]

    def observe(self, *identifiers: str) -> list[dict]:
        response = self.post("/api/v1/discovery/observations", json={"identifiers": list(identifiers)})
        assert response.status_code == 200, response.text
        return response.json()["observed_users"]


@pytest.fixture
def install(client: TestClient):
    def factory(nickname: str | None = None, *, ready: bool = True) -> Installation:
        response = client.post(
            "/api/v1/installations",
            json={"installation_request_id": str(uuid4()), "platform": "android"},
        )
        assert response.status_code == 201, response.text
        body = response.json()
        installation = Installation(client, body["user_id"], body["installation_credential"])
        if ready:
            installation.profile(nickname or "테스터").discovery(True)
        return installation

    return factory
