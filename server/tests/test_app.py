import json

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_health_and_documentation():
    with TestClient(create_app(Settings(_env_file=None))) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
        for path in ("/docs", "/redoc", "/openapi.json"):
            assert client.get(path).status_code == 200
        assert "/health" in client.get("/openapi.json").json()["paths"]


def test_cors(monkeypatch):
    for origins in (
        ["http://localhost:5173", "http://127.0.0.1:5173"],
        ["https://example.com"],
    ):
        monkeypatch.setenv("CORS_ORIGINS", json.dumps(origins))
        with TestClient(create_app(Settings(_env_file=None))) as client:
            for origin in [*origins, "https://disallowed.example"]:
                response = client.options(
                    "/health",
                    headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
                )
                assert response.status_code == (200 if origin in origins else 400)
                assert response.headers.get("access-control-allow-origin") == (
                    origin if origin in origins else None
                )


def test_readiness_failure_and_recovery():
    from unittest.mock import AsyncMock

    from redis.exceptions import ConnectionError, TimeoutError

    from app.redis import get_redis

    app = create_app(Settings(_env_file=None))
    redis = AsyncMock()
    redis.ping.side_effect = [ConnectionError(), TimeoutError(), True]
    app.dependency_overrides[get_redis] = lambda: redis
    with TestClient(app) as client:
        for expected in (503, 503, 200):
            response = client.get("/ready")
            assert response.status_code == expected
            assert response.json() == {
                "status": "ok" if expected == 200 else "unavailable"
            }
            assert client.get("/health").json() == {"status": "ok"}


def test_startup_without_redis():
    import socket

    # Reserve an unlistened port so an unrelated local Redis cannot affect this test.
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        app = create_app(Settings(_env_file=None, redis_url=f"redis://127.0.0.1:{port}"))
        with TestClient(app) as client:
            assert client.get("/health").status_code == 200
            response = client.get("/ready")
            assert response.status_code == 503
            assert response.json() == {"status": "unavailable"}


def test_capacitor_webview_origin_is_allowed_by_default():
    """The Android app's origin is https://localhost, not the API's own host.

    A real device found this: the APK failed CORS preflight because the deployed
    config listed only the Vite dev origins. Both the app default and compose.yaml
    have to carry it, so assert the default rather than trusting the comment.
    """
    with TestClient(create_app(Settings(_env_file=None))) as client:
        response = client.options(
            "/api/v1/me",
            headers={
                "Origin": "https://localhost",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == "https://localhost"
