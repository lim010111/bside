"""API v0.1 behaviour: docs/api-contract.md and docs/openapi.yaml."""

import asyncio
import json

from uuid import UUID, uuid4

import pytest
from redis.asyncio import Redis

from app.security import derive_credential_key
from app.store import Store


def message_body(recipient: str, text: str = "안녕하세요") -> dict:
    return {"recipient_id": recipient, "client_message_id": str(uuid4()), "text": text}


# --- installation and authentication ---------------------------------------


def test_registration_is_idempotent_and_its_replay_window_expires(client, settings):
    request = {"installation_request_id": str(uuid4()), "platform": "android"}
    first = client.post("/api/v1/installations", json=request)
    assert first.status_code == 201
    retry = client.post("/api/v1/installations", json=request)
    assert retry.status_code == 200
    assert retry.json() == first.json()

    # Past the replay window the key is still known, but the credential is gone.
    import redis as sync_redis

    store = sync_redis.from_url(settings.redis_url)
    store.delete(f"install:replay:{request['installation_request_id']}")
    expired = client.post("/api/v1/installations", json=request)
    assert expired.status_code == 409
    assert expired.json()["error"]["code"] == "IDEMPOTENCY_REPLAY_EXPIRED"
    store.close()


def test_registration_stores_only_an_encrypted_replay(client, settings):
    import redis as sync_redis

    request_id = str(uuid4())
    response = client.post(
        "/api/v1/installations",
        json={"installation_request_id": request_id, "platform": "android"},
    )
    assert response.status_code == 201

    store = sync_redis.from_url(settings.redis_url, decode_responses=True)
    replay = store.get(f"install:replay:{request_id}")
    link = store.get(f"install:link:{request_id}")
    credential = response.json()["installation_credential"]
    assert replay.startswith("v1:")
    assert credential not in replay
    assert credential not in link
    assert set(json.loads(link)) == {"user_id", "platform", "created_at"}
    store.close()


def test_legacy_plaintext_replay_expires_without_replacing_its_credential(client, settings):
    import redis as sync_redis

    request_id = str(uuid4())
    first = client.post(
        "/api/v1/installations",
        json={"installation_request_id": request_id, "platform": "android"},
    )
    store = sync_redis.from_url(settings.redis_url, decode_responses=True)
    store.set(
        f"install:replay:{request_id}",
        json.dumps({"installation_credential": first.json()["installation_credential"]}),
    )

    replay = client.post(
        "/api/v1/installations",
        json={"installation_request_id": request_id, "platform": "android"},
    )
    assert replay.status_code == 409
    assert replay.json()["error"]["code"] == "IDEMPOTENCY_REPLAY_EXPIRED"
    assert store.get(f"install:replay:{request_id}").startswith("{")
    store.close()


@pytest.mark.asyncio
async def test_registration_converges_under_concurrency(settings, flush):
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    store = Store(redis, settings)
    request_id = str(uuid4())
    start = asyncio.Event()

    async def register():
        await start.wait()
        return await store.register_installation(request_id, "android")

    tasks = [asyncio.create_task(register()) for _ in range(20)]
    start.set()
    results = await asyncio.gather(*tasks)
    payloads = [payload for _, payload in results]

    assert [outcome for outcome, _ in results].count("created") == 1
    assert all(payload == payloads[0] for payload in payloads)
    assert len(await redis.keys("user:*")) == 1
    assert len(await redis.keys("cred:*")) == 1
    assert await redis.get(derive_credential_key(payloads[0]["installation_credential"])) == payloads[0]["user_id"]
    await redis.aclose()


def test_registration_rejects_a_reused_key_with_different_content(client):
    request = {"installation_request_id": str(uuid4()), "platform": "android"}
    assert client.post("/api/v1/installations", json=request).status_code == 201
    conflict = client.post("/api/v1/installations", json={**request, "platform": "ios"})
    # 'ios' is not an allowed platform at all, so the field is rejected first.
    assert conflict.status_code == 422
    assert conflict.json()["error"]["details"]["field"] == "platform"


def test_registration_rejects_a_malformed_idempotency_key(client):
    response = client.post(
        "/api/v1/installations",
        json={"installation_request_id": "not-a-uuid", "platform": "android"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert response.json()["error"]["details"]["field"] == "installation_request_id"


def test_a_public_user_id_is_not_a_credential(client, install):
    alice = install("앨리스")
    assert client.get("/api/v1/me").status_code == 401
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {alice.user_id}"}).status_code == 401
    assert client.get("/api/v1/me", headers={"Authorization": "Bearer nonsense"}).status_code == 401
    body = client.get("/api/v1/me", headers=alice.headers).json()
    assert body["user_id"] == alice.user_id


def test_unknown_fields_and_bad_json_are_refused(client, install):
    alice = install()
    extra = alice.post("/api/v1/me/discovery", json={"enabled": True, "surprise": 1})
    assert extra.status_code == 422
    assert extra.json()["error"]["code"] == "VALIDATION_ERROR"
    broken = alice.client.post(
        "/api/v1/me/discovery",
        headers={**alice.headers, "Content-Type": "application/json"},
        content=b"{not json",
    )
    assert broken.status_code == 400
    assert broken.json()["error"]["code"] == "BAD_REQUEST"


# --- profile and discovery --------------------------------------------------


def test_a_new_installation_has_no_profile_and_discovery_off(client, install):
    fresh = install(ready=False)
    body = fresh.get("/api/v1/me").json()
    assert body["profile"] is None
    assert body["discovery_enabled"] is False


def test_profile_is_replaced_whole_and_identical_values_are_a_no_op(client, install):
    alice = install(ready=False)
    profile = {
        "nickname": "앨리스",
        "self_description": "백엔드를 만들고 있어요",
        "connection_intent": "배포 이야기를 나누고 싶어요",
    }
    assert alice.post("/api/v1/me/profile", json=profile).json() == profile
    assert alice.post("/api/v1/me/profile", json=profile).json() == profile
    assert alice.get("/api/v1/me").json()["profile"] == profile


@pytest.mark.parametrize(
    "field,value",
    [("nickname", ""), ("nickname", "가" * 21), ("self_description", "나" * 501), ("connection_intent", "")],
)
def test_profile_limits_are_counted_in_code_points(client, install, field, value):
    alice = install(ready=False)
    profile = {"nickname": "앨리스", "self_description": "소개", "connection_intent": "의도"}
    response = alice.post("/api/v1/me/profile", json={**profile, field: value})
    assert response.status_code == 422
    assert response.json()["error"]["details"]["field"] == field


def test_emoji_count_as_single_code_points(client, install):
    alice = install(ready=False)
    profile = {"nickname": "😀" * 20, "self_description": "소개", "connection_intent": "의도"}
    assert alice.post("/api/v1/me/profile", json=profile).status_code == 200
    assert alice.post("/api/v1/me/profile", json={**profile, "nickname": "😀" * 21}).status_code == 422


# --- identifiers ------------------------------------------------------------


def test_identifiers_need_a_profile_and_discovery_on(client, install):
    alice = install(ready=False)
    assert alice.post("/api/v1/discovery/identifiers").json()["error"]["code"] == "PROFILE_REQUIRED"
    alice.profile("앨리스")
    assert alice.post("/api/v1/discovery/identifiers").json()["error"]["code"] == "DISCOVERY_DISABLED"
    alice.discovery(True)
    assert len(alice.identifier()) == 22


def test_the_identifier_is_stable_until_its_rotation_time(client, install):
    alice = install("앨리스")
    assert alice.identifier() == alice.identifier()


@pytest.mark.asyncio
async def test_identifier_rejects_an_empty_profile_field(settings, flush):
    from redis.asyncio import Redis

    from app.store import Store

    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    user_id = str(uuid4())
    await redis.hset(
        f"user:{user_id}",
        mapping={
            "nickname": "",
            "self_description": "소개",
            "connection_intent": "대화",
            "discovery_enabled": "1",
        },
    )
    outcome, identifier = await Store(redis, settings).issue_identifier(user_id)
    assert (outcome, identifier) == ("PROFILE_REQUIRED", None)
    assert await redis.exists(f"ident:current:{user_id}") == 0
    await redis.aclose()


@pytest.mark.asyncio
async def test_identifier_rotation_is_atomic_and_keeps_the_old_mapping_until_ttl(settings, flush):
    from redis.asyncio import Redis

    from app.store import Store, now_ms

    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    store = Store(redis, settings)
    user_id = str(uuid4())
    await redis.hset(
        f"user:{user_id}",
        mapping={
            "nickname": "동시성",
            "self_description": "소개",
            "connection_intent": "대화",
            "discovery_enabled": "1",
        },
    )
    outcome, first = await store.issue_identifier(user_id)
    assert outcome == "ok"
    current_key = f"ident:current:{user_id}"
    record = json.loads(await redis.get(current_key))
    moment = now_ms()
    record["issued_at_ms"] = moment - 240_000
    record["refresh_after_ms"] = moment - 1
    record["expires_at_ms"] = moment + 60_000
    await redis.set(current_key, json.dumps(record), px=60_000)
    await redis.pexpire(f"ident:map:{first['identifier']}", 60_000)

    start = asyncio.Event()

    async def rotate():
        await start.wait()
        return await store.issue_identifier(user_id)

    tasks = [asyncio.create_task(rotate()) for _ in range(20)]
    await asyncio.sleep(0)
    start.set()
    results = await asyncio.gather(*tasks)
    identifiers = {value[1]["identifier"] for value in results}
    assert len(identifiers) == 1
    assert first["identifier"] not in identifiers
    assert await redis.get(f"ident:map:{first['identifier']}") == user_id
    assert 0 < await redis.pttl(f"ident:map:{first['identifier']}") <= 60_000
    await redis.aclose()


# --- observations -----------------------------------------------------------


def test_observations_return_public_profiles_and_an_eligibility_window(client, install):
    alice, bob = install("앨리스"), install("밥")
    observed = alice.observe(bob.identifier())
    assert len(observed) == 1
    assert observed[0]["user_id"] == bob.user_id
    assert observed[0]["profile"]["nickname"] == "밥"
    assert observed[0]["recommendation"] == {"status": "unavailable"}
    assert observed[0]["conversation_eligibility_expires_at"] > observed[0]["last_seen_at"]
    # The public profile is exactly three fields; no internal revision leaks out.
    assert set(observed[0]["profile"]) == {"nickname", "self_description", "connection_intent"}


def test_junk_self_and_duplicate_identifiers_are_ignored_without_failing_the_batch(client, install):
    alice, bob = install("앨리스"), install("밥")
    identifier = bob.identifier()
    observed = alice.observe(identifier, identifier, alice.identifier(), "A" * 22)
    assert [user["user_id"] for user in observed] == [bob.user_id]


def test_an_observation_report_is_bounded(client, install):
    alice = install("앨리스")
    assert alice.post("/api/v1/discovery/observations", json={"identifiers": []}).status_code == 422
    too_many = {"identifiers": ["A" * 22] * 51}
    assert alice.post("/api/v1/discovery/observations", json=too_many).status_code == 422


def test_a_person_with_discovery_off_is_not_observable(client, install):
    alice, bob = install("앨리스"), install("밥")
    identifier = bob.identifier()
    bob.discovery(False)
    assert alice.observe(identifier) == []


def test_turning_discovery_off_drops_my_own_observations(client, install):
    alice, bob = install("앨리스"), install("밥")
    assert alice.observe(bob.identifier())
    alice.discovery(False)
    # Not advertising means not collecting: an in-flight report resolves to nothing.
    assert alice.observe(bob.identifier()) == []


# --- chat -------------------------------------------------------------------


def test_a_first_message_needs_an_observation_and_both_sides_discovering(client, install):
    alice, bob = install("앨리스"), install("밥")
    blind = alice.post("/api/v1/messages", json=message_body(bob.user_id))
    assert blind.status_code == 403
    assert blind.json()["error"]["code"] == "OBSERVATION_REQUIRED"

    alice.observe(bob.identifier())
    bob.discovery(False)
    off = alice.post("/api/v1/messages", json=message_body(bob.user_id))
    assert off.status_code == 403
    assert off.json()["error"]["code"] == "DISCOVERY_DISABLED"

    bob.discovery(True)
    created = alice.post("/api/v1/messages", json=message_body(bob.user_id))
    assert created.status_code == 201
    assert created.json()["seq"] == 1


def test_an_existing_conversation_ignores_proximity_and_discovery(client, install):
    alice, bob = install("앨리스"), install("밥")
    alice.observe(bob.identifier())
    assert alice.post("/api/v1/messages", json=message_body(bob.user_id)).status_code == 201

    alice.discovery(False)
    bob.discovery(False)
    later = alice.post("/api/v1/messages", json=message_body(bob.user_id, "이어서"))
    assert later.status_code == 201
    assert later.json()["seq"] == 2
    # The recipient can still reply after leaving and turning discovery off.
    reply = bob.post("/api/v1/messages", json=message_body(alice.user_id, "답장"))
    assert reply.status_code == 201
    assert reply.json()["conversation_id"] == later.json()["conversation_id"]
    assert reply.json()["seq"] == 3


def test_the_same_client_message_id_replays_and_a_changed_one_conflicts(client, install):
    alice, bob, carol = install("앨리스"), install("밥"), install("캐럴")
    alice.observe(bob.identifier(), carol.identifier())
    body = message_body(bob.user_id)
    first = alice.post("/api/v1/messages", json=body)
    assert first.status_code == 201
    replay = alice.post("/api/v1/messages", json=body)
    assert replay.status_code == 200
    assert replay.json() == first.json()

    for changed in ({**body, "text": "다른 내용"}, {**body, "recipient_id": carol.user_id}):
        conflict = alice.post("/api/v1/messages", json=changed)
        assert conflict.status_code == 409
        assert conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"


def test_messages_reject_a_malformed_idempotency_key(client, install):
    alice = install("앨리스")
    response = alice.post(
        "/api/v1/messages",
        json={"recipient_id": str(uuid4()), "client_message_id": "not-a-uuid", "text": "안녕하세요"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert response.json()["error"]["details"]["field"] == "client_message_id"


def test_one_conversation_per_pair_even_when_both_send_first(client, install):
    alice, bob = install("앨리스"), install("밥")
    alice.observe(bob.identifier())
    bob.observe(alice.identifier())
    mine = alice.post("/api/v1/messages", json=message_body(bob.user_id, "내가 먼저"))
    theirs = bob.post("/api/v1/messages", json=message_body(alice.user_id, "내가 먼저"))
    assert mine.json()["conversation_id"] == theirs.json()["conversation_id"]
    assert [mine.json()["seq"], theirs.json()["seq"]] == [1, 2]
    assert len(alice.get("/api/v1/conversations").json()["conversations"]) == 1


def test_a_missing_recipient_and_a_message_to_myself_are_distinguished(client, install):
    alice = install("앨리스")
    missing = alice.post("/api/v1/messages", json=message_body(str(uuid4())))
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "RECIPIENT_NOT_FOUND"
    myself = alice.post("/api/v1/messages", json=message_body(alice.user_id))
    assert myself.status_code == 422
    assert myself.json()["error"]["details"]["field"] == "recipient_id"


def test_message_text_limits(client, install):
    alice, bob = install("앨리스"), install("밥")
    alice.observe(bob.identifier())
    assert alice.post("/api/v1/messages", json=message_body(bob.user_id, "가" * 2000)).status_code == 201
    for text in ("", "나" * 2001):
        response = alice.post("/api/v1/messages", json=message_body(bob.user_id, text))
        assert response.status_code == 422
        assert response.json()["error"]["details"]["field"] == "text"


def test_conversations_list_the_peer_profile_newest_first(client, install):
    alice, bob, carol = install("앨리스"), install("밥"), install("캐럴")
    alice.observe(bob.identifier(), carol.identifier())
    alice.post("/api/v1/messages", json=message_body(bob.user_id, "밥에게"))
    alice.post("/api/v1/messages", json=message_body(carol.user_id, "캐럴에게"))
    conversations = alice.get("/api/v1/conversations").json()["conversations"]
    assert [row["participant"]["profile"]["nickname"] for row in conversations] == ["캐럴", "밥"]
    assert conversations[0]["last_message"]["text"] == "캐럴에게"
    assert set(conversations[0]["participant"]["profile"]) == {
        "nickname",
        "self_description",
        "connection_intent",
    }


def test_history_pages_forward_only_and_reports_the_next_cursor(client, install):
    alice, bob = install("앨리스"), install("밥")
    alice.observe(bob.identifier())
    for index in range(1, 106):
        assert alice.post("/api/v1/messages", json=message_body(bob.user_id, str(index))).status_code == 201
    conversation = alice.get("/api/v1/conversations").json()["conversations"][0]["conversation_id"]

    first = alice.get(f"/api/v1/conversations/{conversation}/messages").json()
    assert [first["messages"][0]["seq"], len(first["messages"]), first["has_more"], first["next_after_seq"]] == [
        1,
        50,
        True,
        50,
    ]
    last = alice.get(f"/api/v1/conversations/{conversation}/messages", params={"after_seq": 100}).json()
    assert [len(last["messages"]), last["has_more"], last["next_after_seq"]] == [5, False, None]
    assert last["messages"][-1]["seq"] == 105


def test_only_participants_can_read_a_conversation(client, install):
    alice, bob, stranger = install("앨리스"), install("밥"), install("낯선사람")
    alice.observe(bob.identifier())
    conversation = alice.post("/api/v1/messages", json=message_body(bob.user_id)).json()["conversation_id"]
    assert bob.get(f"/api/v1/conversations/{conversation}/messages").status_code == 200
    denied = stranger.get(f"/api/v1/conversations/{conversation}/messages")
    assert denied.status_code == 404
    assert denied.json()["error"]["code"] == "CONVERSATION_NOT_FOUND"
    assert alice.get(f"/api/v1/conversations/{uuid4()}/messages").status_code == 404


def test_conversation_path_requires_a_uuid(client, install):
    alice = install("앨리스")
    invalid = alice.get("/api/v1/conversations/not-a-uuid/messages")
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"
    assert invalid.json()["error"]["details"]["field"] == "path.conversation_id"
    assert alice.get(f"/api/v1/conversations/{UUID(int=0)}/messages").status_code == 404


def test_history_query_bounds(client, install):
    alice, bob = install("앨리스"), install("밥")
    alice.observe(bob.identifier())
    conversation = alice.post("/api/v1/messages", json=message_body(bob.user_id)).json()["conversation_id"]
    path = f"/api/v1/conversations/{conversation}/messages"
    assert alice.get(path, params={"limit": 101}).status_code == 422
    assert alice.get(path, params={"limit": 0}).status_code == 422
    assert alice.get(path, params={"after_seq": -1}).status_code == 422


def test_stored_messages_survive_a_new_application_instance(client, install, settings):
    """A restart must not lose history, sequence numbers or dedupe keys."""
    from fastapi.testclient import TestClient

    from app.main import create_app

    alice, bob = install("앨리스"), install("밥")
    alice.observe(bob.identifier())
    body = message_body(bob.user_id, "재시작 전에 보낸 메시지")
    conversation = alice.post("/api/v1/messages", json=body).json()["conversation_id"]

    with TestClient(create_app(settings)) as restarted:
        page = restarted.get(f"/api/v1/conversations/{conversation}/messages", headers=alice.headers)
        assert [m["text"] for m in page.json()["messages"]] == ["재시작 전에 보낸 메시지"]
        replay = restarted.post("/api/v1/messages", headers=alice.headers, json=body)
        assert replay.status_code == 200, "중복 방지 키가 재시작 후에도 남아 있어야 한다"
        assert replay.json()["seq"] == 1
