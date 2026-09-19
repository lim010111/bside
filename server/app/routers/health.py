from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.redis import get_redis

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready", responses={503: {"description": "Redis unavailable"}})
async def ready(redis: Annotated[Redis, Depends(get_redis)]) -> JSONResponse:
    try:
        if await redis.ping():
            return JSONResponse({"status": "ok"})
    except (RedisError, OSError):
        pass
    return JSONResponse({"status": "unavailable"}, status_code=503)
