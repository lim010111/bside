"""Redis storage for the v0.1 API (server/docs/redis.md).

Key shapes, all flat and none of them room- or event-scoped:

    user:{user_id}                hash    profile fields + discovery_enabled
    cred:{sha256(credential)}     string  -> user_id
    install:replay:{request_id}   string  -> registration result, expires in 10 min
    install:link:{request_id}     string  -> {user_id, platform}, kept for the install
    ident:current:{user_id}       string  -> the identifier record now advertised
    ident:map:{identifier}        string  -> user_id, expires with the identifier
    obs:{observer}                zset    observed user -> server receipt time (ms)
    pair:{low}|{high}             string  -> conversation_id
    conv:{id}                     hash    the two user ids
    conv:{id}:msgs                list    messages, index == seq - 1
    conv:{id}:seq                 string  sequence counter
    user:{user_id}:convs          zset    conversation -> last message time (ms)
    idem:{sender}:{client_msg_id} string  -> the message that key produced

Identifier overlap needs no bookkeeping: rotation writes a new `ident:map` key and
the replaced one expires on its own clock, which is exactly the contract's "the
replaced value overlaps for at most one minute".
"""

from __future__ import annotations

import hashlib
import json
import secrets
from base64 import urlsafe_b64encode
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from redis.asyncio import Redis

from app.config import Settings

_SEND_SCRIPT = (Path(__file__).parent / "scripts" / "send_message.lua").read_text(encoding="utf-8")
_PROFILE_SCRIPT = (Path(__file__).parent / "scripts" / "put_profile.lua").read_text(encoding="utf-8")

PROFILE_FIELDS = ("nickname", "self_description", "connection_intent")


def now_ms() -> int:
    return int(datetime.now(tz=UTC).timestamp() * 1000)


def to_rfc3339(milliseconds: int) -> str:
    """UTC RFC 3339 with seconds precision, the way the contract writes times."""
    return datetime.fromtimestamp(milliseconds / 1000, tz=UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def new_identifier() -> str:
    """22 characters of unpadded base64url over 128 random bits."""
    return urlsafe_b64encode(secrets.token_bytes(16)).decode().rstrip("=")


def new_credential() -> str:
    return "ic_" + secrets.token_urlsafe(32)


def credential_key(credential: str) -> str:
    # The raw bearer secret is never stored, so a dump of Redis does not hand out
    # working credentials.
    return "cred:" + hashlib.sha256(credential.encode()).hexdigest()


@dataclass(frozen=True)
class SendResult:
    status: str
    message: dict[str, Any] | None = None


class Store:
    def __init__(self, redis: Redis, settings: Settings) -> None:
        self.redis = redis
        self.settings = settings

    # --- installations -------------------------------------------------------

    async def register_installation(self, request_id: str, platform: str) -> tuple[str, dict[str, Any]]:
        """Return (outcome, payload) where outcome is created/replayed/conflict/expired."""
        replay = await self.redis.get(f"install:replay:{request_id}")
        link = await self.redis.get(f"install:link:{request_id}")
        if replay:
            stored = json.loads(replay)
            if stored["platform"] != platform:
                return "conflict", {}
            return "replayed", stored
        if link:
            stored = json.loads(link)
            if stored["platform"] != platform:
                return "conflict", {}
            # The key is still known but its credential is past the replay window.
            return "expired", {}

        user_id = str(uuid4())
        credential = new_credential()
        created_at = to_rfc3339(now_ms())
        payload = {
            "user_id": user_id,
            "installation_credential": credential,
            "created_at": created_at,
            "platform": platform,
        }
        pipe = self.redis.pipeline()
        pipe.hset(f"user:{user_id}", mapping={"discovery_enabled": "0", "created_at": created_at})
        pipe.set(credential_key(credential), user_id)
        pipe.set(f"install:replay:{request_id}", json.dumps(payload), ex=self.settings.installation_replay_seconds)
        pipe.set(f"install:link:{request_id}", json.dumps({"user_id": user_id, "platform": platform}))
        await pipe.execute()
        return "created", payload

    async def user_for_credential(self, credential: str) -> str | None:
        user_id = await self.redis.get(credential_key(credential))
        if not user_id or not await self.redis.exists(f"user:{user_id}"):
            return None
        return user_id

    # --- profile and discovery ----------------------------------------------

    async def get_user(self, user_id: str) -> dict[str, str]:
        return await self.redis.hgetall(f"user:{user_id}")

    @staticmethod
    def profile_of(user: dict[str, str]) -> dict[str, str] | None:
        if not all(user.get(field) for field in PROFILE_FIELDS):
            return None
        return {field: user[field] for field in PROFILE_FIELDS}

    async def put_profile(self, user_id: str, profile: dict[str, str]) -> dict[str, str]:
        """Replace the profile and return it. The revision bump happens in Lua."""
        await self.redis.eval(
            _PROFILE_SCRIPT,
            0,
            user_id,
            profile["nickname"],
            profile["self_description"],
            profile["connection_intent"],
        )
        return profile

    @staticmethod
    def revision_of(user: dict[str, str]) -> int:
        """Internal input version for the AI cache. Never in a public response."""
        try:
            return int(user.get("profile_revision", 0))
        except (TypeError, ValueError):
            return 0

    async def set_discovery(self, user_id: str, enabled: bool) -> bool:
        await self.redis.hset(f"user:{user_id}", "discovery_enabled", "1" if enabled else "0")
        if not enabled:
            # Stop advertising and drop what this user observed. Conversations and
            # their history are untouched.
            current = await self.redis.get(f"ident:current:{user_id}")
            if current:
                await self.redis.delete(f"ident:map:{json.loads(current)['identifier']}")
            await self.redis.delete(f"ident:current:{user_id}", f"obs:{user_id}")
        return enabled

    # --- identifiers ---------------------------------------------------------

    async def issue_identifier(self, user_id: str) -> dict[str, str]:
        moment = now_ms()
        current = await self.redis.get(f"ident:current:{user_id}")
        if current:
            record = json.loads(current)
            if moment < record["refresh_after_ms"]:
                return self._identifier_view(record)

        identifier = new_identifier()
        record = {
            "identifier": identifier,
            "issued_at_ms": moment,
            "refresh_after_ms": moment + self.settings.identifier_refresh_after_seconds * 1000,
            "expires_at_ms": moment + self.settings.identifier_ttl_seconds * 1000,
        }
        pipe = self.redis.pipeline()
        # The replaced identifier keeps its own TTL, which is the overlap window.
        pipe.set(f"ident:map:{identifier}", user_id, ex=self.settings.identifier_ttl_seconds)
        pipe.set(f"ident:current:{user_id}", json.dumps(record), ex=self.settings.identifier_ttl_seconds)
        await pipe.execute()
        return self._identifier_view(record)

    @staticmethod
    def _identifier_view(record: dict[str, Any]) -> dict[str, str]:
        return {
            "identifier": record["identifier"],
            "issued_at": to_rfc3339(record["issued_at_ms"]),
            "refresh_after": to_rfc3339(record["refresh_after_ms"]),
            "expires_at": to_rfc3339(record["expires_at_ms"]),
        }

    # --- observations --------------------------------------------------------

    async def report_observations(self, observer: str, identifiers: list[str]) -> list[dict[str, Any]]:
        """Resolve identifiers to users and record the server receipt time."""
        moment = now_ms()
        unique = list(dict.fromkeys(identifiers))
        resolved = await self.redis.mget([f"ident:map:{value}" for value in unique])

        candidates: list[str] = []
        for user_id in resolved:
            # Unknown, expired, self and duplicate identifiers are skipped, never a
            # batch failure.
            if not user_id or user_id == observer or user_id in candidates:
                continue
            candidates.append(user_id)
        if not candidates:
            return []

        pipe = self.redis.pipeline()
        for user_id in candidates:
            pipe.hgetall(f"user:{user_id}")
        users = await pipe.execute()

        observed: list[dict[str, Any]] = []
        writes = self.redis.pipeline()
        for user_id, user in zip(candidates, users, strict=True):
            profile = self.profile_of(user)
            if not profile or user.get("discovery_enabled") != "1":
                continue
            writes.zadd(f"obs:{observer}", {user_id: moment})
            observed.append(
                {
                    "user_id": user_id,
                    "profile": profile,
                    # Internal, stripped before the response. The router needs it to
                    # key the recommendation cache.
                    "profile_revision": self.revision_of(user),
                    "last_seen_at": to_rfc3339(moment),
                    "conversation_eligibility_expires_at": to_rfc3339(
                        moment + self.settings.observation_eligibility_seconds * 1000
                    ),
                }
            )
        if observed:
            await writes.execute()
        return observed

    # --- chat ----------------------------------------------------------------

    async def send_message(self, sender: str, recipient: str, client_message_id: str, text: str) -> SendResult:
        moment = now_ms()
        raw = await self.redis.eval(
            _SEND_SCRIPT,
            0,
            sender,
            recipient,
            client_message_id,
            text,
            str(moment),
            str(self.settings.observation_eligibility_seconds * 1000),
            str(uuid4()),
            str(uuid4()),
            to_rfc3339(moment),
        )
        result = json.loads(raw)
        return SendResult(result["status"], result.get("message"))

    async def list_conversations(self, user_id: str) -> list[dict[str, Any]]:
        ids = await self.redis.zrevrange(f"user:{user_id}:convs", 0, -1)
        if not ids:
            return []
        pipe = self.redis.pipeline()
        for conversation in ids:
            pipe.hgetall(f"conv:{conversation}")
            pipe.lindex(f"conv:{conversation}:msgs", -1)
        rows = await pipe.execute()

        summaries: list[dict[str, Any]] = []
        peers: list[str] = []
        pending: list[tuple[str, dict[str, Any]]] = []
        for index, conversation in enumerate(ids):
            members, last = rows[index * 2], rows[index * 2 + 1]
            if not members or not last:
                continue  # A conversation exists only once a message is stored.
            peer = members["user_b"] if members["user_a"] == user_id else members["user_a"]
            peers.append(peer)
            pending.append((conversation, json.loads(last)))

        profiles = self.redis.pipeline()
        for peer in peers:
            profiles.hgetall(f"user:{peer}")
        peer_rows = await profiles.execute()

        for (conversation, last), peer, user in zip(pending, peers, peer_rows, strict=True):
            profile = self.profile_of(user)
            if not profile:
                continue
            summaries.append(
                {
                    "conversation_id": conversation,
                    "participant": {"user_id": peer, "profile": profile},
                    "last_message": last,
                }
            )
        return summaries

    async def get_messages(self, user_id: str, conversation: str, after_seq: int, limit: int) -> dict[str, Any] | None:
        members = await self.redis.hgetall(f"conv:{conversation}")
        if not members or user_id not in (members.get("user_a"), members.get("user_b")):
            return None
        total = await self.redis.llen(f"conv:{conversation}:msgs")
        # index == seq - 1, so everything after a sequence starts at that index.
        rows = await self.redis.lrange(f"conv:{conversation}:msgs", after_seq, after_seq + limit - 1)
        messages = [json.loads(row) for row in rows]
        has_more = total > after_seq + len(messages)
        return {
            "messages": messages,
            "next_after_seq": messages[-1]["seq"] if has_more and messages else None,
            "has_more": has_more,
        }
