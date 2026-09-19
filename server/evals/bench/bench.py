"""후보 20명 성능 측정. 콜드/캐시와 반복을 구분해 기록한다.

`AI-D5` 의 '목록 즉시 표시·추천 갱신 5초 이내'는 **측정 전 목표**다. 이 스크립트는 목표
달성 여부를 판정하지 않고 실제 값을 남긴다. 캐시 적중을 콜드 성공으로 적지 않는다.

사용:
  uv run python evals/bench/bench.py --mode scripted --repeats 5
  uv run python evals/bench/bench.py --mode live --model claude-haiku-4-5 --repeats 2
"""

from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from pathlib import Path

EVALS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(EVALS.parent))
sys.path.insert(0, str(EVALS))

from app.ai import (  # noqa: E402
    AISettings,
    EvaluationStatus,
    InMemoryRecommendationCache,
    OpenAICompatibleGateway,
    ParticipantProfile,
    RecommendationRequest,
    RecommendationService,
)
from harness import ScriptedGateway  # noqa: E402

GATEWAY_URL = "https://ai.cs.kookmin.ac.kr/v1"


def build_request() -> RecommendationRequest:
    doc = json.loads((EVALS / "fixtures" / "bench20.json").read_text(encoding="utf-8"))

    def profile(raw):
        return ParticipantProfile(
            user_id=raw["user_id"],
            self_description=raw["self_description"],
            connection_intent=raw["connection_intent"],
            profile_revision=raw["profile_revision"],
        )

    return RecommendationRequest(
        viewer=profile(doc["viewer"]),
        candidates=tuple(profile(c) for c in doc["candidates"]),
    )


async def measure(args) -> dict:
    request = build_request()
    live = args.mode == "live"
    settings = AISettings(
        _env_file=(EVALS.parent / ".env") if live else None,
        base_url=GATEWAY_URL,
        model=args.model if live else "scripted-offline",
        max_output_tokens=args.max_output_tokens,
        batch_size=args.batch_size,
        max_concurrent_requests=args.concurrency,
        **({} if live else {"api_key": "offline-unused"}),
    )
    if live and not (settings.api_key and settings.api_key.get_secret_value()):
        raise SystemExit("AI_API_KEY 가 없어 실사용 측정을 할 수 없습니다.")

    cold: list[dict] = []
    cached: list[dict] = []

    for index in range(args.repeats):
        # 콜드: 매번 빈 캐시로 시작한다. 이전 반복의 결과를 재사용하면 콜드가 아니다.
        cache = InMemoryRecommendationCache()
        gateway = OpenAICompatibleGateway(settings) if live else ScriptedGateway()
        async with RecommendationService(settings, cache=cache, gateway=gateway) as service:
            started = time.perf_counter()
            first = await service.recommend(request)
            cold.append(sample(first, (time.perf_counter() - started) * 1000, index))

            started = time.perf_counter()
            second = await service.recommend(request)
            cached.append(sample(second, (time.perf_counter() - started) * 1000, index))

    return {
        "mode": args.mode,
        "model": settings.model,
        # 캐시 구간의 수치는 같은 프로세스 안의 InMemory 캐시다. Redis·네트워크를 거친
        # 실제 API 응답 시간이 아니므로 그대로 서비스 지연으로 읽으면 안 된다.
        "cache_backend": "InMemoryRecommendationCache (같은 프로세스, Redis 아님)",
        "candidates": len(request.candidates),
        "batch_size": settings.batch_size,
        "max_concurrent_requests": settings.max_concurrent_requests,
        "max_output_tokens": settings.max_output_tokens,
        "repeats": args.repeats,
        "cold": summarise(cold),
        "cached": summarise(cached),
        "cold_runs": cold,
        "cached_runs": cached,
        "note": (
            "콜드는 매 반복마다 빈 캐시에서 시작한다. 캐시 구간은 같은 입력을 곧바로 다시 "
            "물은 것이며 게이트웨이 호출이 0이어야 한다. 5초 목표는 측정 전 목표이고 "
            "이 기록은 달성 여부 판정이 아니다."
        ),
    }


def sample(result, wall_ms, index) -> dict:
    statuses: dict[str, int] = {}
    failures: dict[str, int] = {}
    for item in result.recommendations:
        statuses[item.status.name] = statuses.get(item.status.name, 0) + 1
        if item.failure_code is not None:
            failures[item.failure_code.name] = failures.get(item.failure_code.name, 0) + 1
    return {
        "failure_codes": failures,
        # 제공자가 보고한 값. None 은 '보고 안 함'이며 0 과 다르다. complete=False 는
        # 일부 호출만 사용량을 돌려준 것이라 총계로 읽으면 안 된다(시간 초과 등).
        "usage": {
            "input_tokens": result.usage.input_tokens,
            "output_tokens": result.usage.output_tokens,
            "total_tokens": result.usage.total_tokens,
            "complete": result.usage.complete,
            "reported_calls": result.usage.reported_calls,
            "provider_calls": result.usage.provider_calls,
        },
        "repeat": index,
        "wall_ms": round(wall_ms, 1),
        "duration_ms": result.duration_ms,
        "gateway_calls": result.gateway_calls,
        "cache_hits": result.cache_hits,
        "statuses": statuses,
        "evaluated": sum(
            1 for i in result.recommendations if i.status is EvaluationStatus.EVALUATED
        ),
        "returned": len(result.recommendations),
        "anomalies": list(result.anomalies),
    }


def summarise(runs: list[dict]) -> dict:
    times = sorted(r["wall_ms"] for r in runs)
    return {
        "runs": len(runs),
        "wall_ms_min": times[0],
        "wall_ms_median": statistics.median(times),
        "wall_ms_max": times[-1],
        "gateway_calls_total": sum(r["gateway_calls"] for r in runs),
        "failure_codes_total": {
            code: sum(r["failure_codes"].get(code, 0) for r in runs)
            for code in {c for r in runs for c in r["failure_codes"]}
        },
        "evaluated_per_run": [r["evaluated"] for r in runs],
        # INSUFFICIENT_EVIDENCE 는 '평가를 마치고 근거가 부족하다고 판정한 것'이다.
        # 호출이 실패한 FAILED, 아직 평가하지 않은 PENDING 과 같은 칸에 넣으면 안 된다.
        "insufficient_per_run": [r["statuses"].get("INSUFFICIENT_EVIDENCE", 0) for r in runs],
        "failed_per_run": [r["statuses"].get("FAILED", 0) for r in runs],
        "pending_per_run": [r["statuses"].get("PENDING", 0) for r in runs],
        "usage_per_run": [r["usage"] for r in runs],
        "cache_hits_total": sum(r["cache_hits"] for r in runs),
        "returned_all": sorted({r["returned"] for r in runs}),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("scripted", "live"), default="scripted")
    parser.add_argument("--model", default="claude-haiku-4-5")
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=5)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--max-output-tokens", type=int, default=4096)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    report = asyncio.run(measure(args))
    text = json.dumps(report, ensure_ascii=False, indent=2)
    out = Path(args.out) if args.out else EVALS / "results" / f"bench-{args.mode}-{report['model']}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(text + "\n", encoding="utf-8")

    cold, cached = report["cold"], report["cached"]
    print(f"모드={report['mode']} 모델={report['model']} 후보={report['candidates']}명 "
          f"배치={report['batch_size']} 동시={report['max_concurrent_requests']}")
    print(f"  콜드  중앙 {cold['wall_ms_median']:.0f}ms (최소 {cold['wall_ms_min']:.0f} / "
          f"최대 {cold['wall_ms_max']:.0f}), 배치호출 합 {cold['gateway_calls_total']}")
    print(f"    후보 {report['candidates']}명 중 실행별 EVALUATED {cold['evaluated_per_run']}"
          f" / INSUFFICIENT_EVIDENCE {cold['insufficient_per_run']}"
          f" / FAILED {cold['failed_per_run']} / PENDING {cold['pending_per_run']}")
    print("    (INSUFFICIENT_EVIDENCE 는 평가를 마친 판정이고 FAILED·PENDING 과 다르다)")
    if cold["failure_codes_total"]:
        print(f"    실패코드: {cold['failure_codes_total']}")
    print(f"  캐시  중앙 {cached['wall_ms_median']:.0f}ms (최소 {cached['wall_ms_min']:.0f} / "
          f"최대 {cached['wall_ms_max']:.0f}), 배치호출 합 {cached['gateway_calls_total']}, "
          f"캐시적중 합 {cached['cache_hits_total']}")
    print(f"    캐시 백엔드: {report['cache_backend']}")
    if cached["gateway_calls_total"]:
        print("    주의: 캐시 구간에 게이트웨이 호출이 있었다. 콜드에서 실패해 저장되지 않은 "
              "후보를 다시 부른 것이므로 순수 캐시 적중이 아니다.")
    print(f"  기록: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
