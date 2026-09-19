"""Push notifications over FCM HTTP v1.

## Why this never runs on the request path

Sending is a network call to Google. A message must be stored and acknowledged
whether or not the recipient's phone can be reached, so every send here is
scheduled as a background task and its failures only log. A push that does not
arrive is a missed notification, never a failed message.

## What goes into a payload

Data-only messages, not ``notification`` blocks, so the app decides the channel,
the title and where a tap lands, and so the same code path runs whether the app
is in the foreground or not. A ``notification`` block would be drawn by the
system in the background and by us in the foreground, which is two different
notifications for one event.

The payload leaves this server and passes through Google's infrastructure, so it
carries only what a notification has to show:

* a message push carries the sender's nickname and the message text, which is
  what a chat notification is for;
* a recommendation push carries a nickname and nothing else. The reason quotes
  the two profiles, and that belongs on the screen the user opens, not in a
  payload and not on a lock screen.

## Unconfigured is a supported state

With no service account the server runs exactly as before and simply never
pushes. Deployments without FCM are not broken deployments.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time

import httpx

logger = logging.getLogger(__name__)

SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
TOKEN_URI = "https://oauth2.googleapis.com/token"

# FCM's answer for a token that no longer belongs to an install. The token is
# dead for good, so it is removed rather than retried.
_DEAD_TOKEN_STATUSES = {404}
_DEAD_TOKEN_CODES = {"UNREGISTERED", "INVALID_ARGUMENT"}


class FcmSender:
    """Posts to FCM HTTP v1, authenticated by a service account."""

    def __init__(self, credentials, project_id: str, *, client: httpx.AsyncClient | None = None) -> None:
        self._credentials = credentials
        self._project_id = project_id
        self._client = client or httpx.AsyncClient(timeout=10.0)
        self._owns_client = client is None
        self._access_token: str | None = None
        self._expires_at = 0.0
        # One refresh serves an hour, and concurrent sends would otherwise each
        # mint their own on a cold start.
        self._lock = asyncio.Lock()

    @property
    def endpoint(self) -> str:
        return f"https://fcm.googleapis.com/v1/projects/{self._project_id}/messages:send"

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def _token(self) -> str:
        """Exchange a self-signed JWT for an access token, over httpx.

        google-auth's own refresh goes through ``google.auth.transport.requests``
        and so needs the ``requests`` package and a thread to not block the loop.
        The grant it performs is this: sign an assertion with the service
        account key and post it. Doing it here keeps one HTTP client in the
        server and one fewer dependency. Found by deploying: the refresh failed
        with "The requests library is not installed".
        """
        async with self._lock:
            now = time.time()
            if self._access_token and now < self._expires_at:
                return self._access_token

            import google.auth.jwt

            # .decode: jwt.encode returns bytes, and form-encoding those sends
            # Google a repr rather than the assertion. It answers 400
            # invalid_request, which does not say that.
            assertion = google.auth.jwt.encode(
                self._credentials.signer,
                {
                    "iss": self._credentials.service_account_email,
                    "scope": SCOPE,
                    "aud": TOKEN_URI,
                    "iat": int(now),
                    "exp": int(now) + 3600,
                },
            ).decode("ascii")
            response = await self._client.post(
                TOKEN_URI,
                data={
                    "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    "assertion": assertion,
                },
            )
            response.raise_for_status()
            granted = response.json()
            self._access_token = granted["access_token"]
            # Expire early so a token never dies mid-request.
            self._expires_at = now + max(60, int(granted.get("expires_in", 3600)) - 120)
            return self._access_token

    async def send(self, token: str, data: dict[str, str]) -> str | None:
        """Deliver one data message. Returns a failure code, or None on success.

        ``"DEAD"`` means the caller should forget the token.
        """
        body = {
            "message": {
                "token": token,
                "data": data,
                # Chat and proximity notifications are user-visible and
                # time-sensitive, which is what high priority is for: a normal
                # data message can be held until the device leaves Doze.
                "android": {"priority": "HIGH"},
            }
        }
        try:
            access_token = await self._token()
            response = await self._client.post(
                self.endpoint,
                json=body,
                headers={"Authorization": f"Bearer {access_token}"},
            )
        except Exception as error:  # noqa: BLE001 - an outage is not a failed message
            logger.warning("push send failed: %s", error)
            return "UNREACHABLE"

        if response.status_code < 300:
            return None
        detail = _error_status(response)
        if response.status_code in _DEAD_TOKEN_STATUSES or detail in _DEAD_TOKEN_CODES:
            return "DEAD"
        logger.warning("push rejected (%s): %s", response.status_code, detail)
        return detail or str(response.status_code)


def _error_status(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except (json.JSONDecodeError, ValueError):
        return ""
    error = payload.get("error", {})
    for item in error.get("details", []):
        if "errorCode" in item:
            return str(item["errorCode"])
    return str(error.get("status", ""))


class Push:
    """Sends the two notifications the product has, or quietly does neither."""

    def __init__(self, sender: FcmSender | None, *, redis=None) -> None:
        self._sender = sender
        self._redis = redis
        self._tasks: set[asyncio.Task[None]] = set()

    @property
    def enabled(self) -> bool:
        return self._sender is not None

    async def aclose(self) -> None:
        for task in list(self._tasks):
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        if self._sender is not None:
            await self._sender.aclose()

    def message(self, store, recipient_id: str, sender_nickname: str, text: str, conversation_id: str) -> None:
        """Schedule a new-message notification. Returns immediately."""
        self._schedule(
            store,
            recipient_id,
            {
                "kind": "message",
                "conversation_id": conversation_id,
                "title": sender_nickname,
                "body": text,
            },
        )

    def recommendation(self, store, viewer_id: str, candidate_id: str, candidate_nickname: str) -> None:
        """Schedule a 'someone worth talking to is nearby' notification.

        The reason is deliberately not included: it quotes both profiles, and a
        lock screen is not where that should first appear.
        """
        self._schedule(
            store,
            viewer_id,
            {
                "kind": "recommendation",
                "user_id": candidate_id,
                "title": "가까이에 이야기 나눌 만한 분이 있어요",
                "body": f"{candidate_nickname}님의 소개를 확인해 보세요.",
            },
        )

    def _schedule(self, store, user_id: str, data: dict[str, str]) -> None:
        if not self.enabled:
            return
        task = asyncio.create_task(self._deliver(store, user_id, data))
        # Hold the reference: a bare create_task can be collected mid-flight.
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _deliver(self, store, user_id: str, data: dict[str, str]) -> None:
        try:
            tokens = await store.push_tokens(user_id)
            if not tokens:
                return
            outcomes = await asyncio.gather(
                *(self._sender.send(token, data) for token in tokens),
                return_exceptions=True,
            )
            for token, outcome in zip(tokens, outcomes, strict=True):
                if outcome == "DEAD":
                    # The install is gone. Keeping the token would send this
                    # user's messages to whoever installs next on that device.
                    await store.drop_push_token(token)
        except asyncio.CancelledError:
            raise
        except Exception as error:  # noqa: BLE001 - a push is never worth an error response
            logger.warning("push delivery failed: %s", error)

    async def claim_once(self, key: str, ttl_seconds: int) -> bool:
        """True the first time this key is seen, so one event notifies once.

        A recommendation is re-read from cache on every 15s poll, so without
        this the same pair would notify every poll. Losing Redis means not
        notifying: a repeated buzz about the same person is worse than silence.
        """
        if self._redis is None:
            return True
        try:
            return bool(await self._redis.set(key, "1", nx=True, ex=ttl_seconds))
        except Exception as error:  # noqa: BLE001
            logger.warning("push dedupe unavailable, skipping: %s", error)
            return False


def build_push(settings, redis=None) -> Push:
    """Wire FCM from settings, or return a Push that does nothing."""
    missing = settings.fcm_missing_configuration()
    if missing:
        logger.info("push notifications disabled, missing: %s", ", ".join(missing))
        return Push(None)

    try:
        from google.oauth2 import service_account

        credentials = service_account.Credentials.from_service_account_file(
            settings.fcm_credentials_file, scopes=[SCOPE]
        )
    except Exception as error:  # noqa: BLE001 - a bad key file must not stop the server
        logger.warning("push notifications disabled, credentials unusable: %s", error)
        return Push(None)

    project_id = settings.fcm_project_id or credentials.project_id
    return Push(FcmSender(credentials, project_id), redis=redis)
