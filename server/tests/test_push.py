"""Push notifications: who gets told, and who must not be.

The risk here is not a missed buzz. It is telling the wrong phone: a device that
changed hands still holding the previous user's token would receive their private
messages. Most of these tests are about that.
"""

import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.push import FcmSender, Push
from app.store import Store


class RecordingSender:
    """Stands in for FCM. Records sends and can mark a token dead."""

    def __init__(self, dead: set[str] | None = None) -> None:
        self.sent: list[tuple[str, dict[str, str]]] = []
        self.dead = dead or set()

    async def send(self, token: str, data: dict[str, str]) -> str | None:
        self.sent.append((token, data))
        return "DEAD" if token in self.dead else None

    async def aclose(self) -> None:
        return None

    def to(self, token: str) -> list[dict[str, str]]:
        return [data for sent_token, data in self.sent if sent_token == token]


@pytest.fixture
def pushes(client: TestClient):
    """Replace the app's Push with one that records instead of calling Google."""
    sender = RecordingSender()
    push = Push(sender, redis=client.app.state.redis)
    client.app.state.push = push
    return sender


def settle(client: TestClient) -> None:
    """Let the background send finish.

    Sending is scheduled off the request, so a bare assertion right after the
    response would race it. Any request drives the same loop forward.
    """
    for _ in range(5):
        client.get("/health")


def register(install, token: str) -> dict:
    response = install.post(
        "/api/v1/me/push-token", json={"token": token, "platform": "android"}
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_a_new_message_notifies_the_recipient_and_nobody_else(pushes, install):
    alice, bob = install("앨리스"), install("밥")
    register(alice, "alice-device")
    register(bob, "bob-device")
    alice.observe(bob.identifier())

    alice.post(
        "/api/v1/messages",
        json={
            "recipient_id": bob.user_id,
            "client_message_id": "11111111-1111-4111-8111-111111111111",
            "text": "안녕하세요, 배포 이야기 나눠요.",
        },
    )
    settle(alice.client)

    assert pushes.to("bob-device") == [
        {
            "kind": "message",
            "conversation_id": pushes.to("bob-device")[0]["conversation_id"],
            "title": "앨리스",
            "body": "안녕하세요, 배포 이야기 나눠요.",
        }
    ]
    assert pushes.to("alice-device") == [], "보낸 사람에게 알림이 가면 안 된다"


def test_resending_the_same_message_does_not_buzz_twice(pushes, install):
    """The client retries on a flaky network; the recipient sent one message."""
    alice, bob = install("앨리스"), install("밥")
    register(bob, "bob-device")
    alice.observe(bob.identifier())
    body = {
        "recipient_id": bob.user_id,
        "client_message_id": "22222222-2222-4222-8222-222222222222",
        "text": "같은 메시지",
    }

    first = alice.post("/api/v1/messages", json=body)
    replay = alice.post("/api/v1/messages", json=body)
    settle(alice.client)

    assert first.status_code == 201
    assert replay.status_code == 200, "재전송은 새 메시지가 아니다"
    assert len(pushes.to("bob-device")) == 1


def test_a_refused_message_notifies_nobody(pushes, install):
    """No observation means no conversation, so there is nothing to announce."""
    alice, bob = install("앨리스"), install("밥")
    register(bob, "bob-device")

    refused = alice.post(
        "/api/v1/messages",
        json={
            "recipient_id": bob.user_id,
            "client_message_id": "33333333-3333-4333-8333-333333333333",
            "text": "관측 없이 보내기",
        },
    )
    settle(alice.client)

    assert refused.status_code == 403
    assert pushes.to("bob-device") == []


def test_a_device_that_changes_hands_stops_receiving_the_old_user(pushes, install):
    """The same phone, reinstalled and registered by someone else.

    If the token stayed in the first user's set, their private messages would be
    pushed to a device that is now somebody else's.
    """
    alice, bob, carol = install("앨리스"), install("밥"), install("캐럴")
    register(alice, "shared-phone")
    register(carol, "shared-phone")  # the same device, now Carol's

    alice.observe(bob.identifier())
    carol.observe(bob.identifier())
    bob.observe(alice.identifier(), carol.identifier())
    for index, (sender, recipient) in enumerate([(bob, alice), (bob, carol)]):
        sender.post(
            "/api/v1/messages",
            json={
                "recipient_id": recipient.user_id,
                "client_message_id": f"4444444{index}-4444-4444-8444-444444444444",
                "text": f"{index}번 메시지",
            },
        )
    settle(bob.client)

    delivered = pushes.to("shared-phone")
    assert len(delivered) == 1, "한 기기가 두 사용자의 알림을 받고 있다"
    assert delivered[0]["body"] == "1번 메시지", "캐럴에게 온 것만 받아야 한다"


def test_a_token_fcm_calls_dead_is_forgotten(client: TestClient, install):
    """An uninstalled app's token would otherwise reach the next person to install."""
    sender = RecordingSender(dead={"gone"})
    client.app.state.push = Push(sender, redis=client.app.state.redis)
    alice, bob = install("앨리스"), install("밥")
    register(bob, "gone")
    alice.observe(bob.identifier())

    alice.post(
        "/api/v1/messages",
        json={
            "recipient_id": bob.user_id,
            "client_message_id": "55555555-5555-4555-8555-555555555555",
            "text": "첫 번째",
        },
    )
    settle(client)
    alice.post(
        "/api/v1/messages",
        json={
            "recipient_id": bob.user_id,
            "client_message_id": "66666666-6666-4666-8666-666666666666",
            "text": "두 번째",
        },
    )
    settle(client)

    assert len(sender.to("gone")) == 1, "죽은 토큰으로 계속 보내고 있다"


def test_one_user_can_carry_several_devices(pushes, install):
    alice, bob = install("앨리스"), install("밥")
    register(bob, "bob-phone")
    register(bob, "bob-tablet")
    alice.observe(bob.identifier())

    alice.post(
        "/api/v1/messages",
        json={
            "recipient_id": bob.user_id,
            "client_message_id": "77777777-7777-4777-8777-777777777777",
            "text": "두 기기 모두",
        },
    )
    settle(alice.client)

    assert len(pushes.to("bob-phone")) == 1
    assert len(pushes.to("bob-tablet")) == 1


def test_registering_says_whether_the_server_can_actually_push(client, install):
    """The default app has no FCM. The token is still kept, and it says so."""
    alice = install("앨리스")

    assert register(alice, "token-a") == {"push_enabled": False}

    client.app.state.push = Push(RecordingSender())
    assert register(alice, "token-a") == {"push_enabled": True}


def test_an_unconfigured_server_still_delivers_messages(client, install):
    """Push is an addition. Without it the API behaves exactly as before."""
    alice, bob = install("앨리스"), install("밥")
    alice.observe(bob.identifier())

    sent = alice.post(
        "/api/v1/messages",
        json={
            "recipient_id": bob.user_id,
            "client_message_id": "88888888-8888-4888-8888-888888888888",
            "text": "FCM 없이도 간다",
        },
    )

    assert sent.status_code == 201
    assert client.app.state.push.enabled is False


def test_a_token_is_rejected_when_it_is_not_a_plausible_token(install):
    alice = install("앨리스")

    empty = alice.post("/api/v1/me/push-token", json={"token": "", "platform": "android"})
    unknown = alice.post(
        "/api/v1/me/push-token",
        json={"token": "ok", "platform": "android", "sound": "ding"},
    )

    assert empty.status_code == 422
    assert unknown.status_code == 422, "모르는 필드는 거부한다(계약)"


def test_registering_needs_a_credential(client, install):
    assert client.post(
        "/api/v1/me/push-token", json={"token": "x", "platform": "android"}
    ).status_code == 401


def test_the_dedupe_claim_lets_one_event_through_once(client: TestClient):
    push = Push(RecordingSender(), redis=client.app.state.redis)

    async def claim_twice() -> tuple[bool, bool]:
        from redis.asyncio import Redis

        redis = Redis.from_url(
            Settings(_env_file=None, redis_url="redis://127.0.0.1:6379/15").redis_url,
            decode_responses=True,
        )
        local = Push(RecordingSender(), redis=redis)
        try:
            return await local.claim_once("push:told:a:b", 60), await local.claim_once(
                "push:told:a:b", 60
            )
        finally:
            await redis.aclose()

    assert asyncio.run(claim_twice()) == (True, False)
    assert push.enabled


class StubSigner:
    key_id = "stub"

    def sign(self, message):  # noqa: D102 - google.auth.crypt.Signer protocol
        return b"signature-bytes"


class StubCredentials:
    signer = StubSigner()
    service_account_email = "svc@bside-5a002.iam.gserviceaccount.com"


def test_the_signed_assertion_is_sent_as_text_not_bytes():
    """``jwt.encode`` returns bytes, and form-encoding those sends Google a repr.

    It answers `400 invalid_request`, which says nothing about the cause. This
    cost a deploy to find, so it is pinned here.
    """
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = request.content.decode()
        return httpx.Response(200, json={"access_token": "minted", "expires_in": 3600})

    sender = FcmSender(
        StubCredentials(),
        "bside-5a002",
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )

    async def mint() -> tuple[str, str]:
        try:
            return await sender._token(), await sender._token()
        finally:
            await sender.aclose()

    first, second = asyncio.run(mint())

    assert first == "minted"
    assert second == "minted", "두 번째 호출은 캐시를 써야 한다"
    assert "grant_type=urn" in seen["body"]
    assert "assertion=" in seen["body"]
    assert "b%27" not in seen["body"] and "b'" not in seen["body"], "bytes의 repr이 실려 나갔다"


def test_the_fcm_endpoint_targets_the_configured_project():
    """A wrong project id is a 404 from Google, which is worth catching here."""

    class Credentials:
        valid = True
        token = "t"

    sender = FcmSender(Credentials(), "bside-5a002")
    assert sender.endpoint == (
        "https://fcm.googleapis.com/v1/projects/bside-5a002/messages:send"
    )


def test_the_store_hands_a_token_over_rather_than_sharing_it(client: TestClient):
    """The Lua script's own contract, checked without going through HTTP."""

    async def handover() -> tuple[list[str], list[str], bool, bool]:
        from redis.asyncio import Redis

        redis = Redis.from_url("redis://127.0.0.1:6379/15", decode_responses=True)
        store = Store(redis, Settings(_env_file=None, redis_url="redis://127.0.0.1:6379/15"))
        try:
            first = await store.put_push_token("user-a", "device", "android")
            again = await store.put_push_token("user-a", "device", "android")
            await store.put_push_token("user-b", "device", "android")
            return (
                await store.push_tokens("user-a"),
                await store.push_tokens("user-b"),
                first,
                again,
            )
        finally:
            await redis.aclose()

    owned_by_a, owned_by_b, first, again = asyncio.run(handover())

    assert owned_by_a == [], "이전 소유자에게 토큰이 남아 있다"
    assert owned_by_b == ["device"]
    assert first is True
    assert again is False, "같은 사용자의 재등록은 이동이 아니다"
