"""Paired live latency comparison. No network without --live.

Frozen pre-change prompt versus current prompt, identical input/settings, fresh
Redis pair caches. Raw model outputs, batch elapsed times and normalized results
are retained. Reserves every live call before dispatch using the existing ledger.
This script never increases the ledger cap. Use an isolated local Redis.
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
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

EVALS = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(EVALS.parent), str(EVALS)]

from app.ai import AISettings, OpenAICompatibleGateway, RecommendationService, RedisRecommendationCache
from app.ai.prompt import DefaultPromptProvider
from bench import build_request, sample
from harness import ScriptedGateway
from harness.fixtures import load_case, to_request
from latency import account, save
from redis.asyncio import Redis

BASELINE_COMMIT = '7e7f5c7'
BASELINE_DIGEST = '042d9e7cf2358995'
AFTER_DIGEST = 'ff85b83b0d8db46e'


def baseline_prompt():
    source = subprocess.check_output(['git', 'show', f'{BASELINE_COMMIT}:server/app/ai/prompt.py'], cwd=EVALS, text=True)
    namespace = {}
    exec(compile(source, f'{BASELINE_COMMIT}/prompt.py', 'exec'), namespace)
    prompt = namespace['DefaultPromptProvider']()
    assert prompt.digest == BASELINE_DIGEST
    return prompt


def scenarios():
    base = build_request()
    cases = {}
    for count in (1, 5, 20, 50):
        # Fifty uses the same twenty synthetic profiles cyclically, with unique
        # IDs. Both variants get byte-identical user payloads, including order.
        candidates = tuple(base.candidates[i % len(base.candidates)].model_copy(update={
            'user_id': f'bench-{i:02d}'
        }) for i in range(count))
        cases[f'crowd-{count}'] = base.model_copy(update={'candidates': candidates})
    for name in ('E04', 'E05', 'E06'):
        cases[name] = to_request(load_case(name)['request'])
    # Long-but-supported fields: repeated, explicitly synthetic context near the
    # public 500-character cap. It is a latency probe, not a quality benchmark.
    def expand(text):
        return ' '.join([text] * max(1, 480 // (len(text) + 1)))
    long = cases['crowd-5']
    def longer(person):
        return person.model_copy(update={name: expand(getattr(person, name))
                                        for name in ('self_description', 'connection_intent')})
    cases['long-5'] = long.model_copy(update={'viewer': longer(long.viewer),
                                            'candidates': tuple(longer(c) for c in long.candidates)})
    return cases


class MeasuredGateway(OpenAICompatibleGateway):
    def __init__(self, settings, *, live):
        super().__init__(settings)
        self.live = live
        self.scripted = ScriptedGateway()
        self.batches = []
        self.started = 0.0

    async def complete(self, *, system, user):
        started = time.perf_counter()
        batch = dict(candidate_ids=[c['candidate_id'] for c in json.loads(user)['candidates']],
                     started_ms=round((started - self.started) * 1000, 3))
        try:
            if self.live:
                output = await super().complete(system=system, user=user)
            else:
                self.attempts += 1
                output = await self.scripted.complete(system=system, user=user)
            batch['raw_output'] = output
            return output
        except BaseException as error:
            batch['error_type'] = type(error).__name__
            raise
        finally:
            batch.update(elapsed_ms=round((time.perf_counter() - started) * 1000, 3),
                         completed_ms=round((time.perf_counter() - self.started) * 1000, 3))
            self.batches.append(batch)


class MeasuredCache(RedisRecommendationCache):
    def __init__(self, redis):
        super().__init__(redis)
        self.completions = []
        self.started = 0.0

    async def set(self, key, value, ttl_seconds):
        await super().set(key, value, ttl_seconds)
        self.completions.append(dict(candidate_id=value.candidate_user_id,
                                     status=value.status.value,
                                     stored_ms=round((time.perf_counter() - self.started) * 1000, 3)))


def summary(rows):
    summaries = {}
    for scenario in dict.fromkeys(r['scenario'] for r in rows):
        grouped = {v: [r for r in rows if r['scenario'] == scenario and r['variant'] == v]
                   for v in ('before', 'after')}
        if not all(grouped.values()):
            continue
        values = {v: dict(runs=len(group),
                          wall_ms_median=round(statistics.median(r['wall_ms'] for r in group), 3),
                          wall_ms_min=min(r['wall_ms'] for r in group),
                          wall_ms_max=max(r['wall_ms'] for r in group),
                          input_tokens_median=statistics.median(r['usage']['input_tokens'] for r in group) if all(r['usage']['input_tokens'] is not None for r in group) else None,
                          output_tokens_median=statistics.median(r['usage']['output_tokens'] for r in group) if all(r['usage']['output_tokens'] is not None for r in group) else None,
                          failed_candidates=sum(r['statuses'].get('FAILED', 0) for r in group),
                          anomalies=sum(len(r['anomalies']) for r in group)) for v, group in grouped.items()}
        before, after = values['before']['wall_ms_median'], values['after']['wall_ms_median']
        paired = []
        for repeat in sorted({r['repeat'] for r in grouped['before']}):
            a = next((r for r in grouped['before'] if r['repeat'] == repeat), None)
            b = next((r for r in grouped['after'] if r['repeat'] == repeat), None)
            if a and b:
                paired.append(round(100 * (1 - b['wall_ms'] / a['wall_ms']), 2))
        values.update(reduction_percent=round(100 * (1 - after / before), 2), paired_reduction_percent=paired)
        summaries[scenario] = values
    return summaries


async def run(args):
    if args.output.exists():
        raise SystemExit('Refusing to overwrite an existing measurement')
    if urlparse(args.redis_url).hostname not in {'localhost', '127.0.0.1', '::1'}:
        raise SystemExit('Use isolated local Redis')
    settings = AISettings() if args.live else AISettings(_env_file=None, api_key='offline-unused', model='scripted-offline', base_url='https://example.invalid/v1')
    if args.live and (settings.missing_configuration() or settings.base_url != 'https://ai.cs.kookmin.ac.kr/v1' or settings.model != 'claude-haiku-4-5'):
        raise SystemExit('Expected configured Haiku on the documented gateway')
    # Hold production settings constant; no retries or output-budget shortcuts.
    assert settings.batch_size == 5 and settings.max_concurrent_requests == 4
    assert settings.max_attempts == 1 and settings.max_output_tokens == 4096
    prompts = {'before': baseline_prompt(), 'after': DefaultPromptProvider()}
    assert prompts['after'].digest == AFTER_DIGEST
    cases = scenarios()
    orders = [[1, 5, 20, 50], [50, 20, 5, 1], [20, 1, 50, 5]]
    plan = [(f'crowd-{count}', repeat) for repeat, sizes in enumerate(orders) for count in sizes]
    plan += [(name, 0) for name in ('E04', 'E05', 'E06', 'long-5')]
    if args.smoke:
        plan = plan[:1]
    planned_calls = sum(2 * math.ceil(len(cases[name].candidates) / 5) for name, _ in plan)
    if planned_calls > args.max_new_calls:
        raise SystemExit('Run limit exceeded')
    run_id = uuid4().hex[:12]
    report = dict(at=datetime.now(UTC).isoformat(), run_id=run_id,
                  mode='live' if args.live else 'offline-smoke', model=settings.model,
                  baseline_commit=BASELINE_COMMIT,
                  prompt_digests={v: p.digest for v, p in prompts.items()},
                  system_instructions={v: p.system_instructions() for v, p in prompts.items()},
                  settings={name: getattr(settings, name) for name in ('batch_size', 'max_concurrent_requests', 'max_output_tokens', 'temperature', 'max_attempts', 'request_timeout_seconds', 'total_timeout_seconds')},
                  planned_calls=planned_calls,
                  boundaries='recommend() wall time, local Redis + live gateway + parse/grounding/policy/cache; excludes HTTP endpoint, BLE, UI polling. No TTFT (production is nonstreaming).',
                  order='sequential variant pairs; AB/BA alternates; sizes rotated across repeats; no competing variants in flight',
                  fixture_notes='crowd 50 cycles twenty synthetic profiles with unique IDs; long-5 repeats synthetic text near 500 chars per field. E04/E05/E06 existing tuning hypotheses, not fresh held-out quality proof.',
                  requests={name: request.model_dump(mode='json') for name, request in cases.items()},
                  runs=[])
    redis = Redis.from_url(args.redis_url, decode_responses=True)
    try:
        report['redis_version'] = (await redis.info('server'))['redis_version']
        if args.live:
            # A crash retains the conservative reservation. Reconciliation uses
            # pre-dispatch gateway attempt counters, never successful responses.
            account(f'latency-ab:{run_id}', planned_calls)
        attempts = 0
        save(args.output, report)
        for index, (name, repeat) in enumerate(plan):
            variants = ['before', 'after'] if (index + repeat) % 2 == 0 else ['after', 'before']
            for variant in variants:
                request = cases[name].model_copy(update={'viewer': cases[name].viewer.model_copy(update={
                    'user_id': f'latency-ab-{run_id}-{name}-{repeat}'
                })})
                cache = MeasuredCache(redis)
                gateway = MeasuredGateway(settings, live=args.live)
                service = RecommendationService(settings, cache=cache, gateway=gateway, prompt=prompts[variant])
                try:
                    started = gateway.started = cache.started = time.perf_counter()
                    result = await service.recommend(request)
                    elapsed = (time.perf_counter() - started) * 1000
                    row = sample(result, elapsed, repeat)
                    row.update(scenario=name, variant=variant, candidates=len(request.candidates),
                               prompt_digest=result.prompt_digest, inference_digest=result.inference_digest,
                               result=result.model_dump(mode='json'), batches=gateway.batches,
                               cached_candidates_at=cache.completions)
                    assert result.cache_hits == 0
                    if all(r.status.name in {'EVALUATED', 'INSUFFICIENT_EVIDENCE'} for r in result.recommendations):
                        before = gateway.attempts
                        warm_start = time.perf_counter()
                        warm = await service.recommend(request)
                        row['warm_ms'] = round((time.perf_counter() - warm_start) * 1000, 3)
                        row['warm_cache_hits'] = warm.cache_hits
                        row['warm_gateway_calls'] = gateway.attempts - before
                        assert row['warm_gateway_calls'] == 0
                    report['runs'].append(row)
                    report['summary'] = summary(report['runs'])
                    save(args.output, report)
                    print(json.dumps({k: row[k] for k in ('scenario', 'variant', 'repeat', 'wall_ms', 'statuses', 'anomalies', 'usage')}, ensure_ascii=False), flush=True)
                finally:
                    attempts += gateway.attempts
                    await service.aclose()
                    await gateway.aclose()
        report['actual_calls'] = attempts if args.live else 0
        report['finished_at'] = datetime.now(UTC).isoformat()
        save(args.output, report)
        if args.live:
            account(f'latency-ab:{run_id}', planned_calls, attempts)
        print(json.dumps({'summary': report['summary'], 'actual_calls': report['actual_calls']}, ensure_ascii=False, indent=2), flush=True)
    finally:
        await redis.aclose()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--smoke', action='store_true', help='one before/after pair, for offline wiring checks')
    parser.add_argument('--redis-url', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--max-new-calls', type=int, default=104)
    asyncio.run(run(parser.parse_args()))
