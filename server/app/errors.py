"""Every failure leaves through the one error shape docs/api-contract.md defines."""

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from redis.exceptions import RedisError
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    """A refusal the contract names, carrying its own status code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}


def error_response(
    status_code: int, code: str, message: str, details: dict[str, Any] | None = None
) -> JSONResponse:
    return JSONResponse(
        {"error": {"code": code, "message": message, "details": details or {}}},
        status_code=status_code,
    )


def unauthorized(message: str = "A valid installation credential is required.") -> ApiError:
    return ApiError(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", message)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return error_response(exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def _validation(_request: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        # A malformed body is a 400; a well-formed body with a bad field is a 422.
        if first.get("type") == "json_invalid":
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "BAD_REQUEST",
                "The request body is not valid JSON.",
            )
        location = [part for part in first.get("loc", ()) if part not in ("body", "query")]
        details = {"field": ".".join(str(part) for part in location)} if location else {}
        return error_response(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "VALIDATION_ERROR",
            first.get("msg", "Request field validation failed."),
            details,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        codes = {
            status.HTTP_400_BAD_REQUEST: "BAD_REQUEST",
            status.HTTP_401_UNAUTHORIZED: "UNAUTHORIZED",
            status.HTTP_403_FORBIDDEN: "FORBIDDEN",
            status.HTTP_404_NOT_FOUND: "NOT_FOUND",
            status.HTTP_405_METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
        }
        return error_response(
            exc.status_code,
            codes.get(exc.status_code, "REQUEST_FAILED"),
            str(exc.detail),
        )

    @app.exception_handler(RedisError)
    async def _redis(_request: Request, _exc: RedisError) -> JSONResponse:
        # The store is the only backing service; say it is unavailable rather than
        # reporting a success the data never reached.
        return error_response(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "A required backing service is temporarily unavailable.",
        )

    @app.exception_handler(OSError)
    async def _os(_request: Request, _exc: OSError) -> JSONResponse:
        return error_response(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "A required backing service is temporarily unavailable.",
        )
