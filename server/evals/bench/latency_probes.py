"""Offline characterization of latency risks, using production service/bridge code.

No model calls. These record present behavior (including defects), not acceptance
tests asserting that defects are desirable. Requires disposable local Redis.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

EVALS = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(EVALS.parent), str(EVALS)]

from app.ai import AISettings, InMemoryRecommendationCache, RecommendationRequest, RecommendationService
from app.ai.errors import AITimeoutError
from app.ai.gateway import record_attempt
from app.recommendations import Recommendations, job_key
from bench import build_request
from harness import ScriptedGateway
from redis.asyncio import Redis


class DelayedGateway(ScriptedGateway):
    reports_attempts = True

    def __init__(self, delay=0.06, fail=False):
        super().__init__()
        self.delay, self.fail = delay, fail
        self.started = []

    async def complete(self, *, system, user):
        record_attempt()
        self.started.append([c["candidate_id"] for c in json.loads(user)["candidates"]])
        await asyncio.sleep(self.delay)
        if self.fail:
            raise AITimeoutError("Injected timeout; no network")
        return await super().complete(system=system, user=user)


def settings(**overrides):
    return AISettings(_env_file=None, api_key="offline-unused", model="scripted-offline",
                      base_url="https://example.invalid/v1", **overrides)


def fresh():
    base = build_request()
    return base.model_copy(update={"viewer": base.viewer.model_copy(update={"user_id": uuid4().hex})})


async def annotate(bridge, request):
    return await bridge.annotate(
        request.viewer.user_id,
        dict(self_description=request.viewer.self_description, connection_intent=request.viewer.connection_intent),
        request.viewer.profile_revision,
        [dict(user_id=c.user_id, profile_revision=c.profile_revision,
              profile=dict(self_description=c.self_description, connection_intent=c.connection_intent))
         for c in request.candidates],
    )


async def drain(bridge):
    await asyncio.gather(*list(bridge._tasks))


async def main(args):
    if urlparse(args.redis_url).hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise SystemExit("Use disposable local Redis")
    redis = Redis.from_url(args.redis_url, decode_responses=True)
    report = {"mode": "offline fault injection; no provider calls", "probes": {}}
    try:
        # A completed job still blocks a revised profile, although old cache
        # entries correctly fail to match the revised input.
        request = fresh()
        request = request.model_copy(update={"candidates": request.candidates[:1]})
        gateway = DelayedGateway()
        cache = InMemoryRecommendationCache()
        service = RecommendationService(settings(), cache=cache, gateway=gateway)
        bridge = Recommendations(service, cache, redis=redis)
        try:
            await annotate(bridge, request)
            await drain(bridge)
            revised = request.model_copy(update={"viewer": request.viewer.model_copy(update={
                "profile_revision": request.viewer.profile_revision + 1,
                "connection_intent": "일상에서 함께 산책할 사람을 만나고 싶습니다.",
            })})
            response = await annotate(bridge, revised)
            await drain(bridge)
            key = job_key(request.viewer, service.inference_digest, request.candidates[0])
            report["probes"]["profile_change_after_completed_job"] = dict(
                calls=len(gateway.started), revised_statuses=response, lock_ttl=await redis.ttl(key))
        finally:
            await bridge.aclose()

        # Two reports overlap on one person but differ as whole candidate sets.
        base = fresh()
        first = base.model_copy(update={"candidates": base.candidates[:1]})
        second = base.model_copy(update={"candidates": base.candidates[:2]})
        gateway = DelayedGateway()
        cache = InMemoryRecommendationCache()
        bridge = Recommendations(RecommendationService(settings(), cache=cache, gateway=gateway), cache, redis=redis)
        try:
            await annotate(bridge, first)
            async with asyncio.timeout(1):
                while not gateway.started:
                    await asyncio.sleep(0.001)
            await annotate(bridge, second)
            await drain(bridge)
            report["probes"]["overlapping_candidate_sets"] = dict(
                calls=len(gateway.started), dispatched=gateway.started,
                per_candidate_calls=dict(Counter(c for batch in gateway.started for c in batch)))
        finally:
            await bridge.aclose()

        # A timeout is represented by FAILED inside the module, but the API
        # cannot retrieve it because failures are not cached.
        request = fresh()
        request = request.model_copy(update={"candidates": request.candidates[:1]})
        gateway = DelayedGateway(fail=True)
        cache = InMemoryRecommendationCache()
        bridge = Recommendations(RecommendationService(settings(), cache=cache, gateway=gateway), cache, redis=redis)
        try:
            before = await annotate(bridge, request)
            await drain(bridge)
            after = await annotate(bridge, request)
            await drain(bridge)
            report["probes"]["failed_evaluation_next_poll"] = dict(before=before, after=after, calls=len(gateway.started))
        finally:
            await bridge.aclose()

        # The total deadline applies inside recommend(), but not annotate().
        class SlowCache(InMemoryRecommendationCache):
            async def get(self, key):
                await asyncio.sleep(0.12)
                return None

        cache = SlowCache()
        service = RecommendationService(settings(total_timeout_seconds=0.02), cache=cache, gateway=DelayedGateway())
        bridge = Recommendations(service, cache, redis=redis)
        try:
            started = time.perf_counter()
            await annotate(bridge, request)
            report["probes"]["slow_cache_on_list_path"] = dict(
                annotate_ms=round((time.perf_counter() - started) * 1000, 3), configured_ai_deadline_ms=20)
        finally:
            await bridge.aclose()

        # Accelerate the clock by 50x. 9s per batch is an explicit hypothetical
        # service time, not a live concurrency measurement or production p95.
        report["probes"]["shared_worker_queue"] = []
        for viewers in [2, 5, 20]:
            scale = 0.02
            gateway = DelayedGateway(delay=9 * scale)
            async with RecommendationService(settings(total_timeout_seconds=45 * scale), gateway=gateway) as service:
                requests = [fresh() for _ in range(viewers)]
                requests = [r.model_copy(update={"candidates": r.candidates[:19]}) for r in requests]
                results = await asyncio.gather(*(service.recommend(r) for r in requests))
                report["probes"]["shared_worker_queue"].append(dict(
                    viewers=viewers, candidates_per_viewer=19, assumed_batch_seconds=9,
                    deadline_seconds=45, concurrency=4, time_scale=scale,
                    actual_mock_wall_ms=[r.duration_ms for r in results],
                    equivalent_seconds=[round(r.duration_ms / 1000 / scale, 2) for r in results],
                    dispatched_calls=sum(r.gateway_calls for r in results),
                    failed_candidates=sum(i.status.name == "FAILED" for r in results for i in r.recommendations),
                    returned_candidates=sum(len(r.recommendations) for r in results),
                ))
    finally:
        await redis.aclose()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--redis-url", required=True)
    parser.add_argument("--out", required=True, type=Path)
    asyncio.run(main(parser.parse_args()))
