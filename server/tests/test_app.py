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
        import json

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
