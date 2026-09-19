from fastapi import Request
from redis.asyncio import Redis


def get_redis(request: Request) -> Redis:
    """Return the application-owned asynchronous client for future APIs."""
    return request.app.state.redis
