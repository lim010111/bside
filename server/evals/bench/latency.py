"""Measure the current recommendation bridge; no provider calls without --live.

Use a disposable local Redis. This never flushes it; run-specific synthetic
viewer IDs isolate cache/job keys. Cold and warm exclude HTTP, BLE and polling.
Live calls reserve against the existing ledger cap before dispatch, including
failures/cancellation. Run serially with other live evaluation tools.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import statistics
import subprocess
import sys
import time
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

EVALS = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(EVALS.parent), str(EVALS)]

from app.ai import AISettings, OpenAICompatibleGateway, RecommendationService, RedisRecommendationCache
from app.recommendations import Recommendations
from bench import build_request, sample
from harness import ScriptedGateway
from redis.asyncio import Redis

LEDGER = EVALS / "results/live-budget.json"
GATEWAY = "https://ai.cs.kookmin.ac.kr/v1"


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def account(label, upper_bound, actual=None):
    ledger = json.loads(LEDGER.read_text())
    entry = next((e for e in ledger["entries"] if e["label"] == label), None)
    if entry is None:
        if ledger["generation_requests"] + upper_bound > ledger["cap"]:
            raise RuntimeError("Existing live-call cap would be exceeded")
        entry = dict(label=label, at=datetime.now(UTC).isoformat(),
                     gateway_calls=upper_bound, actual_calls=None,
                     accounting="conservative reservation", kind="latency-audit")
        ledger["entries"].append(entry)
        ledger["generation_requests"] += upper_bound
    if actual is not None:
        ledger["generation_requests"] += actual - entry["gateway_calls"]
        entry.update(gateway_calls=actual, actual_calls=actual, accounting="measured")
    ledger["remaining"] = ledger["cap"] - ledger["generation_requests"]
    save(LEDGER, ledger)


class MeasuredService(RecommendationService):
    async def recommend(self, request):
        start = time.perf_counter()
        self.result = await super().recommend(request)
        self.wall_ms = (time.perf_counter() - start) * 1000
        return self.result


async def measure(args):
    if urlparse(args.redis_url).hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise SystemExit("Use a disposable local Redis, not a deployed database")
    if args.out.exists():
        raise SystemExit("Output already exists; use a new path, do not overwrite measurements")
    settings = AISettings() if args.live else AISettings(
        _env_file=None, api_key="offline-unused", base_url="https://example.invalid/v1",
        model="scripted-offline",
    )
    if args.live and (settings.base_url != GATEWAY or settings.missing_configuration()):
        raise SystemExit("Live evaluation requires the configured, documented gateway")
    if args.live and settings.model != "claude-haiku-4-5":
        raise SystemExit("This audit measures the selected Haiku model")
    expected = args.repeats * sum(math.ceil(n / settings.effective_batch_size()) for n in args.sizes) * settings.max_attempts
    if args.live:
        ledger = json.loads(LEDGER.read_text())
        if expected > args.max_new_calls or ledger["generation_requests"] + expected > ledger["cap"]:
            raise SystemExit("Planned calls exceed the run limit or existing ledger cap")
    run_id = uuid4().hex[:12]
    report = dict(
        at=datetime.now(UTC).isoformat(), run_id=run_id,
        commit=subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=EVALS, text=True).strip(),
        mode="live" if args.live else "scripted", model=settings.model,
        settings={name: getattr(settings, name) for name in (
            "batch_size", "max_concurrent_requests", "max_output_tokens", "max_attempts",
            "temperature", "request_timeout_seconds", "total_timeout_seconds", "cache_ttl_seconds",
        )},
        fixture="fixtures/bench20.json (prefixes of 1/5/20; synthetic, not daily-use quality validation)",
        cache_backend="disposable local Redis", runs=[],
        boundaries="pending/warm: annotate(); cold: recommend(), including local Redis and gateway; no HTTP/BLE/polling",
    )
    redis = Redis.from_url(args.redis_url, decode_responses=True)
    try:
        report["redis_version"] = (await redis.info("server"))["redis_version"]
        base = build_request()
        # Interleave sizes to reduce confounding by gateway conditions over time.
        for repeat in range(args.repeats):
            for count in args.sizes:
                viewer = base.viewer.model_copy(update={"user_id": f"latency-{run_id}-{repeat}-{count}"})
                candidates = base.candidates[:count]
                observed = [dict(user_id=c.user_id, profile_revision=c.profile_revision,
                                 profile=dict(self_description=c.self_description, connection_intent=c.connection_intent))
                            for c in candidates]
                profile = dict(self_description=viewer.self_description, connection_intent=viewer.connection_intent)
                cache = RedisRecommendationCache(redis)
                gateway = OpenAICompatibleGateway(settings) if args.live else ScriptedGateway()
                service = MeasuredService(settings, gateway=gateway, cache=cache)
                bridge = Recommendations(service, cache, settings=settings, redis=redis)
                label = f"latency:{run_id}:{repeat}:{count}"
                upper = math.ceil(count / settings.effective_batch_size()) * settings.max_attempts
                try:
                    if args.live:
                        account(label, upper)
                    started = time.perf_counter()
                    first = await bridge.annotate(viewer.user_id, profile, viewer.profile_revision, observed)
                    pending_ms = (time.perf_counter() - started) * 1000
                    await asyncio.gather(*list(bridge._tasks))
                    result = service.result
                    row = sample(result, service.wall_ms, repeat)
                    row.update(candidates=count, pending_ms=round(pending_ms, 3),
                               pending_statuses=dict(Counter(v["status"] for v in first.values())),
                               prompt_digest=result.prompt_digest, inference_digest=result.inference_digest)
                    # A failed cold is not a warm cache benchmark; never spend a
                    # second paid attempt just to produce a warm number.
                    if all(i.status.name in {"EVALUATED", "INSUFFICIENT_EVIDENCE"} for i in result.recommendations):
                        before = getattr(gateway, "attempts", getattr(gateway, "calls", 0))
                        started = time.perf_counter()
                        warm = await bridge.annotate(viewer.user_id, profile, viewer.profile_revision, observed)
                        row["warm_ms"] = round((time.perf_counter() - started) * 1000, 3)
                        await asyncio.gather(*list(bridge._tasks))
                        row["warm_statuses"] = dict(Counter(v["status"] for v in warm.values()))
                        row["warm_gateway_calls"] = getattr(gateway, "attempts", getattr(gateway, "calls", 0)) - before
                    else:
                        row["warm_skipped"] = "Cold had failures; no automatic paid retry"
                    report["runs"].append(row)
                    # Save evidence before reconciling; an interruption leaves
                    # the pre-dispatch upper-bound reservation in the ledger.
                    save(args.out, report)
                    if args.live:
                        account(label, upper, gateway.attempts)
                    print(json.dumps(row, ensure_ascii=False), flush=True)
                finally:
                    await bridge.aclose()
                    await gateway.aclose()
        report["summary"] = {}
        for count in args.sizes:
            rows = [r for r in report["runs"] if r["candidates"] == count]
            report["summary"][str(count)] = {
                name: dict(min=min(values), median=statistics.median(values), max=max(values))
                for name in ["wall_ms", "pending_ms", "warm_ms"]
                if (values := [r[name] for r in rows if name in r])
            }
        save(args.out, report)
    finally:
        await redis.aclose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--redis-url", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--repeats", type=int, choices=range(1, 4), default=3)
    parser.add_argument("--sizes", type=int, nargs="+", choices=[1, 5, 20], default=[1, 5, 20])
    parser.add_argument("--max-new-calls", type=int, default=18)
    asyncio.run(measure(parser.parse_args()))
