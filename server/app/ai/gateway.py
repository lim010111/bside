"""HTTPX gateway for an OpenAI-compatible chat completions endpoint.

Only the chat completions shape is assumed. The base URL, model and key come
from configuration; nothing here is specific to a provider and no model name is
defaulted. The API key is held in a ``SecretStr`` and never appears in log
records, exception messages or ``repr``.
"""

import json
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Protocol, runtime_checkable

import httpx

from app.ai.errors import (
    AIGatewayError,
    AIGatewayHTTPError,
    AIResponseError,
    AIResponseTruncatedError,
    AITimeoutError,
)
from app.ai.settings import AISettings

_USAGE_FIELDS = (
    ("input_tokens", ("prompt_tokens", "input_tokens")),
    ("output_tokens", ("completion_tokens", "output_tokens")),
    ("total_tokens", ("total_tokens",)),
)


class RequestMetrics:
    """Provider requests and reported token usage for one logical request."""

    __slots__ = (
        "count",
        "coverage",
        "input_tokens",
        "output_tokens",
        "reported_usage",
        "total_tokens",
    )

    def __init__(self) -> None:
        self.count = 0
        self.reported_usage = 0
        # ``None`` means the provider never reported this field. It is kept
        # distinct from 0, which would claim a measurement we do not have.
        self.input_tokens: int | None = None
        self.output_tokens: int | None = None
        self.total_tokens: int | None = None
        # How many provider requests reported each field, tracked separately.
        # A response may carry some counts and omit others, and a sum whose
        # parts came from fewer requests than were made is a partial sum even
        # though it is not None.
        self.coverage: dict[str, int] = {field: 0 for field, _ in _USAGE_FIELDS}

    def covers(self, provider_calls: int) -> bool:
        """Whether every field was reported by every request that was made."""
        return provider_calls > 0 and all(
            self.coverage[field] == provider_calls for field, _ in _USAGE_FIELDS
        )

    def add_usage(self, reported: object) -> None:
        if not isinstance(reported, dict):
            return
        values: dict[str, int] = {}
        for field, names in _USAGE_FIELDS:
            for name in names:
                value = reported.get(name)
                # Only plain non-negative ints. ``bool`` is an int subclass and
                # a string count is not a count, so neither is accepted.
                if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
                    values[field] = value
                    break
        if not values:
            return
        self.reported_usage += 1
        for field, value in values.items():
            current = getattr(self, field)
            setattr(self, field, value if current is None else current + value)
            self.coverage[field] += 1


# Per-logical-request, not per-gateway: one service and one HTTPX client are
# shared by every caller, so metrics living on the gateway would bill each
# concurrent request for the other's POSTs and tokens. A ContextVar is copied
# into each task at creation, so the batch tasks a request spawns report to
# that request's metrics and to no other.
_METRICS: ContextVar[RequestMetrics | None] = ContextVar(
    "ai_gateway_metrics", default=None
)


@contextmanager
def collect_metrics() -> Iterator[RequestMetrics]:
    """Collect provider requests and usage for this task and the tasks it starts."""
    metrics = RequestMetrics()
    token = _METRICS.set(metrics)
    try:
        yield metrics
    finally:
        _METRICS.reset(token)


def record_attempt() -> None:
    """Called once per provider request, before it is sent."""
    metrics = _METRICS.get()
    if metrics is not None:
        metrics.count += 1


def record_usage(reported: object) -> None:
    """Called with the provider's ``usage`` object, if it sent one.

    Only the three token counts are read. No other part of the provider body is
    stored or surfaced.
    """
    metrics = _METRICS.get()
    if metrics is not None:
        metrics.add_usage(reported)


@runtime_checkable
class ChatGateway(Protocol):
    """One JSON-returning chat completion."""

    async def complete(self, *, system: str, user: str) -> str: ...

    async def aclose(self) -> None: ...


def _strip_code_fence(text: str) -> str:
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped
    body = stripped[3:]
    if "\n" in body:
        first_line, body = body.split("\n", 1)
        if first_line.strip() not in {"", "json"}:
            body = f"{first_line}\n{body}"
    return body.removesuffix("```").strip()


def parse_json_object(text: str) -> dict[str, Any]:
    """Parse model output that is expected to be a single JSON object."""
    candidate = _strip_code_fence(text)
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError as error:
        raise AIResponseError(f"model output was not JSON: {error.msg}") from None
    if not isinstance(parsed, dict):
        raise AIResponseError("model output was not a JSON object")
    return parsed


class OpenAICompatibleGateway:
    """Calls ``{base_url}{chat_completions_path}`` and returns the message text.

    Reports every provider request through ``record_attempt()``, which is what
    ``reports_attempts`` promises the service, and every ``usage`` object the
    provider returns through ``record_usage()``.

    Pass ``transport`` (for example ``httpx.MockTransport``) to exercise this
    without a network. The client is created lazily and closed by ``aclose()``.
    """

    # Opt-in marker: a gateway that sets this counts its own provider requests,
    # so the service reports those instead of guessing from the batch count.
    reports_attempts = True

    def __init__(
        self,
        settings: AISettings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings
        self._transport = transport
        self._client = client
        self._owns_client = client is None
        self._closed = False
        # Lifetime total for operators. Per-request accounting uses
        # ``count_attempts()``; this number spans every caller and is never
        # differenced to bill one request.
        self.attempts = 0

    def _build_client(self) -> httpx.AsyncClient:
        settings = self._settings
        headers = {"Content-Type": "application/json"}
        if settings.api_key is not None:
            headers["Authorization"] = f"Bearer {settings.api_key.get_secret_value()}"
        return httpx.AsyncClient(
            base_url=settings.base_url or "",
            headers=headers,
            timeout=httpx.Timeout(
                settings.request_timeout_seconds,
                connect=settings.connect_timeout_seconds,
            ),
            transport=self._transport,
        )

    @property
    def client(self) -> httpx.AsyncClient:
        if self._closed:
            raise AIGatewayError("gateway is closed")
        if self._client is None:
            self._client = self._build_client()
        return self._client

    def _request_body(self, *, system: str, user: str) -> dict[str, Any]:
        settings = self._settings
        body: dict[str, Any] = {
            "model": settings.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": settings.temperature,
            "max_tokens": settings.max_output_tokens,
        }
        if settings.use_json_response_format:
            body["response_format"] = {"type": "json_object"}
        return body

    async def complete(self, *, system: str, user: str) -> str:
        settings = self._settings
        last_error: Exception | None = None
        for _ in range(settings.max_attempts):
            client = self.client
            # Counted before the request goes out, so a retry, an error and a
            # cancellation mid-flight all still count as a provider request.
            self.attempts += 1
            record_attempt()
            try:
                response = await client.post(
                    settings.chat_completions_path,
                    json=self._request_body(system=system, user=user),
                )
            except httpx.TimeoutException as error:
                last_error = AITimeoutError(f"gateway timed out: {type(error).__name__}")
                continue
            except httpx.HTTPError as error:
                last_error = AIGatewayError(
                    f"gateway request failed: {type(error).__name__}"
                )
                continue
            if response.status_code >= 400:
                raise AIGatewayHTTPError(response.status_code)
            return self._extract_message(response)
        assert last_error is not None
        raise last_error

    @staticmethod
    def _extract_message(response: httpx.Response) -> str:
        try:
            payload = response.json()
        except ValueError:
            raise AIResponseError("gateway response body was not JSON") from None
        # Recorded before anything can raise below, so a truncated answer still
        # reports the tokens it burned.
        record_usage(payload.get("usage") if isinstance(payload, dict) else None)
        try:
            choice = payload["choices"][0]
            content = choice["message"]["content"]
        except (KeyError, IndexError, TypeError):
            raise AIResponseError(
                "gateway response had no choices[0].message.content"
            ) from None
        # Checked before the content is looked at: output that stopped because
        # it ran out of budget is cut mid-JSON, and parsing what arrived would
        # turn a truncated answer into a confident partial result.
        finish_reason = choice.get("finish_reason") if isinstance(choice, dict) else None
        if finish_reason in {"length", "max_tokens"}:
            raise AIResponseTruncatedError(str(finish_reason))
        if not isinstance(content, str) or not content.strip():
            raise AIResponseError("gateway returned empty message content")
        return content

    async def aclose(self) -> None:
        self._closed = True
        if self._client is not None and self._owns_client:
            await self._client.aclose()
        self._client = None
