"""평가 하네스와 운영 AI 모듈(server/app/ai) 사이의 다리.

stdin 으로 요청 하나를 받아 실제 ``RecommendationService`` 를 돌리고, 결과를 평가 쪽
표준형 JSON 으로 stdout 에 낸다. 평가 전용 프롬프트를 따로 만들지 않는다. 운영 모듈이
쓰는 프롬프트·파서·근거 검증·정책·캐시를 그대로 지난다.

모드
  module-scripted  네트워크 없이 도는 결정론적 가짜 게이트웨이. **모델이 아니다.**
                   모듈의 배치 분할·파싱·근거 검증·정책·캐시 경로를 오프라인에서 실행하는 용도다.
  module-live      실제 게이트웨이 호출. 모델 이름을 인자로 받는다.
  module-fault     게이트웨이가 지정한 예외를 던진다(E08 등 실패 경로).

비밀값은 출력하지 않는다.
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SERVER_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai import (  # noqa: E402
    AISettings,
    InMemoryRecommendationCache,
    NullRecommendationCache,
    OpenAICompatibleGateway,
    ParticipantProfile,
    RecommendationRequest,
    RecommendationService,
)

from harness.gateways import FaultGateway, ScriptedGateway  # noqa: E402

DEFAULT_BASE_URL = "https://ai.cs.kookmin.ac.kr/v1"
ALLOWED_HOSTS = {"ai.cs.kookmin.ac.kr"}


# --------------------------------------------------------------------- 표준형 변환
def _profile(raw: dict) -> ParticipantProfile:
    return ParticipantProfile(
        user_id=raw["user_id"],
        self_description=raw.get("self_description", ""),
        connection_intent=raw.get("connection_intent", ""),
        profile_revision=raw.get("profile_revision", 1),
    )


def normalize(result) -> dict:
    """모듈 DTO -> 평가 표준형. 열거형은 대문자 이름으로 맞춘다."""
    return {
        "viewer_user_id": result.viewer_user_id,
        "viewer_profile_revision": result.viewer_profile_revision,
        "policy_version": result.policy_version,
        "model": result.model,
        "prompt_digest": result.prompt_digest,
        "inference_digest": result.inference_digest,
        "generated_at": result.generated_at.isoformat() if result.generated_at else None,
        "anomalies": list(result.anomalies),
        "cache_hits": result.cache_hits,
        "gateway_calls": result.gateway_calls,
        "duration_ms": result.duration_ms,
        # 사용량은 제공자가 보고한 값이다. None 은 '보고 안 함'이고 0 과 다르다.
        # complete=False 면 일부 호출만 사용량을 돌려준 것이므로 총계로 읽으면 안 된다.
        "usage": {
            "input_tokens": result.usage.input_tokens,
            "output_tokens": result.usage.output_tokens,
            "total_tokens": result.usage.total_tokens,
            "complete": result.usage.complete,
            "reported_calls": result.usage.reported_calls,
            "provider_calls": result.usage.provider_calls,
        },
        "recommendations": [
            {
                "candidate_user_id": r.candidate_user_id,
                "status": r.status.name,
                "rank": r.rank,
                "score": r.score,
                "reason": r.reason,
                "excerpts": [
                    {"source": e.source.name, "quote": e.quote, "verified": e.verified}
                    for e in r.excerpts
                ],
                "intent_conflict": r.intent_conflict,
                "notification_eligible": r.notification_eligible,
                "failure_code": r.failure_code.name if r.failure_code else None,
                "viewer_profile_revision": r.viewer_profile_revision,
                "candidate_profile_revision": r.candidate_profile_revision,
                "from_cache": r.from_cache,
            }
            for r in result.recommendations
        ],
    }


# --------------------------------------------------------------------- 실행
def build_settings(payload: dict) -> AISettings:
    overrides = dict(payload.get("settings") or {})
    settings = AISettings()
    data = settings.model_dump()
    if payload["mode"] != "module-live":
        # 오프라인 모드는 .env 와 무관하게 돌아야 한다. 게이트웨이를 실제로 부르지 않으므로
        # 자격 값은 자리표시자이고, model 이름도 모델이 아니라 실행 경로의 이름이다.
        data["api_key"] = "offline-unused"
        data["base_url"] = DEFAULT_BASE_URL
        data["model"] = payload.get("model") or (
            "scripted-offline" if payload["mode"] == "module-scripted" else "fault-injection"
        )
    data.update({k: v for k, v in overrides.items() if v is not None})
    if payload.get("model"):
        data["model"] = payload["model"]
    if not data.get("base_url"):
        data["base_url"] = DEFAULT_BASE_URL
    return AISettings(**data)


def make_gateway(payload: dict, settings: AISettings):
    mode = payload["mode"]
    if mode == "module-fault":
        return FaultGateway(payload.get("fault", {}).get("kind", "gateway_timeout"))
    if mode == "module-scripted":
        return ScriptedGateway()
    if mode == "module-live":
        from urllib.parse import urlparse

        host = urlparse(settings.base_url or "").hostname
        if host not in ALLOWED_HOSTS:
            raise SystemExit(f"거부: 허용되지 않은 게이트웨이 호스트({host}).")
        return OpenAICompatibleGateway(settings)
    raise SystemExit(f"알 수 없는 mode: {mode}")


async def run(payload: dict) -> dict:
    request = RecommendationRequest(
        viewer=_profile(payload["request"]["viewer"]),
        candidates=tuple(_profile(c) for c in payload["request"]["candidates"]),
    )
    settings = build_settings(payload)
    gateway = make_gateway(payload, settings)
    cache = InMemoryRecommendationCache() if payload.get("cache") else NullRecommendationCache()

    runs = []
    async with RecommendationService(settings, cache=cache, gateway=gateway) as service:
        for _ in range(int(payload.get("repeats", 1))):
            started = time.perf_counter()
            result = await service.recommend(request)
            runs.append(
                {
                    "wall_ms": round((time.perf_counter() - started) * 1000, 1),
                    "result": normalize(result),
                }
            )
    return {
        "mode": payload["mode"],
        "case_id": payload["request"].get("case_id"),
        "model": settings.model,
        "gateway": getattr(gateway, "name", type(gateway).__name__),
        "batch_size": settings.batch_size,
        "runs": runs,
        "result": runs[-1]["result"],
        "gateway_calls_observed": getattr(gateway, "calls", None),
    }


def main() -> int:
    payload = json.load(sys.stdin)
    try:
        print(json.dumps(asyncio.run(run(payload)), ensure_ascii=False))
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001 - 하네스에 원인을 그대로 전달한다
        print(json.dumps({"bridge_error": f"{type(error).__name__}: {error}"}, ensure_ascii=False))
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
