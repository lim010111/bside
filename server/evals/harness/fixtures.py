"""사례 로더. lib/fixtures.js 와 같은 결과를 내야 한다(후보 순서 포함)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

EVALS_DIR = Path(__file__).resolve().parent.parent
CASES_DIR = EVALS_DIR / "fixtures" / "cases"


def _read(relative: str) -> dict[str, Any]:
    return json.loads((EVALS_DIR / relative).read_text(encoding="utf-8"))


def _strip(pool: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in pool.items() if not k.startswith("_")}


TUNING_POOL = _strip(_read("fixtures/participants.json"))
HELDOUT_POOL = _strip(_read("fixtures/participants_heldout.json"))
# 프롬프트 동결 후 새로 만든 보류 풀. 기존 보류는 이미 결과를 본 뒤라 신선하지 않다.
FRESH_POOL = _strip(_read("fixtures/participants_fresh.json"))
_POOLS = {"tuning": TUNING_POOL, "heldout": HELDOUT_POOL, "fresh": FRESH_POOL}


def _fnv1a(text: str) -> int:
    """lib/fixtures.js 의 fnv1a 와 같은 값을 내야 한다(32비트)."""
    h = 0x811C9DC5
    for ch in text:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def _shuffle(candidates: list[dict], seed: str) -> list[dict]:
    # 사례 파일의 후보 순서에는 '기대 순위' 신호가 들어 있다. 그대로 두면 동점을 입력 순서로
    # 깨는 기준선이 판단 없이 1순위를 맞힌다. 고정 해시 순서로 그 신호를 지운다.
    #
    # 시드는 shuffle_group 이다. 교류 의도만 바꾼 비교 쌍은 후보 제시 순서까지 같아야
    # 순위 변화의 원인을 의도 변경으로 좁힐 수 있다.
    return sorted(
        candidates,
        key=lambda c: (_fnv1a(f"{seed}:{c['user_id']}"), c["user_id"]),
    )


def list_cases(case_set: str | None = None) -> list[str]:
    ids = sorted(p.stem for p in CASES_DIR.glob("*.json"))
    if case_set is None:
        return ids
    return [i for i in ids if _read(f"fixtures/cases/{i}.json")["set"] == case_set]


def load_case(case_id: str) -> dict[str, Any]:
    body = _read(f"fixtures/cases/{case_id}.json")
    pool = _POOLS.get(body["pool"], TUNING_POOL)

    def resolve(entry: dict, role: str) -> dict:
        base = pool.get(entry["ref"])
        if base is None:
            raise KeyError(f"{case_id}: {role} 참조 '{entry['ref']}'가 해당 풀에 없습니다.")
        merged = dict(base)
        merged.update({k: v for k, v in entry.items() if k != "ref"})
        return merged

    viewer = resolve(body["request"]["viewer"], "viewer")
    authored = [resolve(c, "candidate") for c in body["request"]["candidates"]]
    body["request"] = {
        "viewer": viewer,
        "candidates": _shuffle(authored, body.get("shuffle_group") or case_id),
        "policy": body["request"].get("policy") or {},
        "fault": body["request"].get("fault"),
        "case_id": case_id,
        "authored_candidate_order": [c["user_id"] for c in authored],
        "shuffle_group": body.get("shuffle_group") or case_id,
    }
    return body


def to_request(request: dict):
    """평가 사례를 모듈의 RecommendationRequest 로 바꾼다."""
    from app.ai import ParticipantProfile, RecommendationRequest

    def profile(raw: dict):
        return ParticipantProfile(
            user_id=raw["user_id"],
            self_description=raw.get("self_description", ""),
            connection_intent=raw.get("connection_intent", ""),
            profile_revision=raw.get("profile_revision", 1),
        )

    return RecommendationRequest(
        viewer=profile(request["viewer"]),
        candidates=tuple(profile(c) for c in request["candidates"]),
    )
