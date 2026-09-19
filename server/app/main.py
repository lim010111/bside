from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis
from redis.backoff import NoBackoff
from redis.retry import Retry

from app.config import Settings
from app.errors import register_error_handlers
from app.recommendations import build_recommendations
from app.routers import health, v1


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        client = Redis.from_url(
            settings.redis_url,
            socket_connect_timeout=2,
            socket_timeout=2,
            retry=Retry(NoBackoff(), 0),
            decode_responses=True,
        )
        app.state.redis = client
        # The AI module shares the application's Redis for its evaluation cache.
        # Unconfigured is a supported state: the API then reports 'unavailable'
        # instead of refusing to start.
        app.state.recommendations = build_recommendations(client)
        try:
            yield
        finally:
            await app.state.recommendations.aclose()
            await client.aclose()

    app = FastAPI(title="Bside API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    app.include_router(health.router)
    app.include_router(v1.router)
    return app


app = create_app()
