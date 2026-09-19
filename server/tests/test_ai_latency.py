"""Latency regressions: strict compact output and duplicate work under concurrency.

All gateways are local fakes; these tests never load a provider credential.
"""
import asyncio
import json
from collections import Counter

import pytest
from redis.asyncio import Redis

from app.ai import EvaluationStatus, FailureCode, InMemoryRecommendationCache, RecommendationService
from app.ai.errors import AITimeoutError
from app.ai.schema import RawEvaluation, parse_evaluation
from app.recommendations import Recommendations, job_key
from test_ai import VIEWER, HELPER, DESIGNER, StubGateway, entry, entry_from_document, payload, request_with, settings as ai_settings


CODES = {'viewer_self_description': 'vs', 'viewer_connection_intent': 'vi',
         'candidate_self_description': 'cs', 'candidate_connection_intent': 'ci'}


def compact(row):
    return dict(id=row['candidate_id'], t='ok' if row['status'] == 'evaluated' else 'insufficient',
                s=row['score'], r=row['reason'], c=row['intent_conflict'],
                e=[[CODES[e['source']], e['quote']] for e in row['evidence']])


@pytest.mark.parametrize('fields', [{}, {'score': .15, 'intent_conflict': True},
                                   {'status': 'insufficient_evidence', 'score': None, 'reason': None}])
async def test_compact_keeps_scores_reasons_grounding_and_policy(fields):
    raw = entry(HELPER.user_id, **fields)
    assert parse_evaluation(compact(raw)) == RawEvaluation.model_validate(raw)
    legacy = RecommendationService(ai_settings(), gateway=StubGateway(payload(raw)))
    short = RecommendationService(ai_settings(), gateway=StubGateway(payload(compact(raw))))
    before, after = await legacy.recommend(request_with(HELPER)), await short.recommend(request_with(HELPER))
    assert before.recommendations == after.recommendations
    assert before.anomalies == after.anomalies
    assert len(payload(compact(raw))) < len(payload(raw))


@pytest.mark.parametrize('change', [
    {'s': '0.9'}, {'s': True}, {'c': 'false'}, {'t': 'maybe'}, {'e': [['unknown', '원문인 척 하는 문장']]},
    {'e': [['vi', 1]]}, {'e': [['vi', '의미 있는 문장', 'extra']]}, {'candidate_id': 'different'},
])
async def test_compact_invalid_claims_fail_the_identified_candidate(change):
    raw = compact(entry(HELPER.user_id)) | change
    service = RecommendationService(ai_settings(), gateway=StubGateway(payload(raw)))
    result = await service.recommend(request_with(HELPER))
    assert result.recommendations[0].failure_code == FailureCode.SCHEMA_MISMATCH


async def test_compact_still_rejects_invented_evidence_and_duplicate_ids():
    raw = compact(entry(HELPER.user_id)) | {'e': [['cs', '여기에 존재하지 않는 내용입니다']]}
    service = RecommendationService(ai_settings(), gateway=StubGateway(payload(raw)))
    assert (await service.recommend(request_with(HELPER))).recommendations[0].failure_code == FailureCode.UNGROUNDED_REASON
    service = RecommendationService(ai_settings(), gateway=StubGateway(payload(raw, raw)))
    assert (await service.recommend(request_with(HELPER))).recommendations[0].failure_code == FailureCode.DUPLICATE_IN_RESPONSE


class HeldGateway:
    def __init__(self):
        self.calls = []
        self.release = asyncio.Event()
        self.fail = False

    async def complete(self, *, system, user):
        document = json.loads(user)
        self.calls.append([c['candidate_id'] for c in document['candidates']])
        await self.release.wait()
        if self.fail:
            raise AITimeoutError('offline timeout')
        return payload(*(compact(entry_from_document(document, c['candidate_id'])) for c in document['candidates']))

    async def aclose(self):
        pass


def bridge(gateway, redis=None):
    cache = InMemoryRecommendationCache()
    service = RecommendationService(ai_settings(), gateway=gateway, cache=cache)
    return Recommendations(service, cache, redis=redis)


async def wait_calls(gateway, count):
    async with asyncio.timeout(2):
        while len(gateway.calls) < count:
            await asyncio.sleep(.001)


async def annotate(bridge, viewer=VIEWER, candidates=(HELPER, DESIGNER)):
    return await bridge.annotate(viewer.user_id, viewer.model_dump(), viewer.profile_revision, [
        dict(user_id=c.user_id, profile=c.model_dump(), profile_revision=c.profile_revision) for c in candidates
    ])


async def drain(bridge):
    await asyncio.gather(*list(bridge._tasks))


async def test_overlapping_sets_are_evaluated_once_even_without_redis():
    gateway = HeldGateway()
    subject = bridge(gateway)
    try:
        await annotate(subject, candidates=(HELPER,))
        await wait_calls(gateway, 1)
        await annotate(subject)
        await wait_calls(gateway, 2)
        await annotate(subject)
        gateway.release.set()
        await drain(subject)
        assert Counter(c for call in gateway.calls for c in call) == {HELPER.user_id: 1, DESIGNER.user_id: 1}
        assert all(r['status'] == 'ready' for r in (await annotate(subject)).values())
        assert not subject._inflight
    finally:
        await subject.aclose()


@pytest.mark.parametrize('which', ['viewer', 'candidate'])
async def test_revision_change_starts_while_old_evaluation_is_in_flight(which):
    gateway = HeldGateway()
    subject = bridge(gateway)
    try:
        await annotate(subject, candidates=(HELPER,))
        await wait_calls(gateway, 1)
        viewer = VIEWER.model_copy(update={'profile_revision': VIEWER.profile_revision + 1}) if which == 'viewer' else VIEWER
        candidate = HELPER.model_copy(update={'profile_revision': HELPER.profile_revision + 1}) if which == 'candidate' else HELPER
        await annotate(subject, viewer=viewer, candidates=(candidate,))
        await wait_calls(gateway, 2)
        gateway.release.set()
        await drain(subject)
        assert (await annotate(subject, viewer=viewer, candidates=(candidate,)))[candidate.user_id]['status'] == 'ready'
    finally:
        await subject.aclose()


async def test_failure_is_visible_and_fast_polls_do_not_retry(monkeypatch):
    gateway = HeldGateway()
    gateway.fail = True
    gateway.release.set()
    subject = bridge(gateway)
    try:
        await annotate(subject)
        await drain(subject)
        assert all(r['status'] == 'failed' for r in (await annotate(subject)).values())
        await drain(subject)
        assert len(gateway.calls) == 1
        import app.ai.cache as cache_module
        now = cache_module.monotonic()
        monkeypatch.setattr(cache_module, 'monotonic', lambda: now + 16)
        assert all(r['status'] == 'pending' for r in (await annotate(subject)).values())
        await drain(subject)
        assert len(gateway.calls) == 2
    finally:
        await subject.aclose()


async def test_redis_workers_share_pair_claims_and_release_only_owned_leases(settings, flush):
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    gateway = HeldGateway()
    first, second = bridge(gateway, redis), bridge(gateway, redis)
    try:
        await annotate(first, candidates=(HELPER,))
        await wait_calls(gateway, 1)
        await annotate(second)
        await wait_calls(gateway, 2)
        assert Counter(c for call in gateway.calls for c in call) == {HELPER.user_id: 1, DESIGNER.user_id: 1}
        key = job_key(VIEWER, first._service.inference_digest, HELPER)
        await redis.set(key, 'new-owner', ex=50)  # simulate expiry + another worker acquiring
        gateway.release.set()
        await drain(first)
        await drain(second)
        assert await redis.get(key) == 'new-owner'
        other = job_key(VIEWER, second._service.inference_digest, DESIGNER)
        assert await redis.get(other) is None
    finally:
        await first.aclose()
        await second.aclose()
        await redis.aclose()


async def test_cancellation_releases_claims_for_an_immediate_retry(settings, flush):
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    gateway = HeldGateway()
    subject = bridge(gateway, redis)
    try:
        await annotate(subject, candidates=(HELPER,))
        await wait_calls(gateway, 1)
        await subject.aclose()
        key = job_key(VIEWER, subject._service.inference_digest, HELPER)
        assert await redis.get(key) is None
        assert not subject._inflight
    finally:
        await redis.aclose()


@pytest.mark.parametrize('count', [1, 5, 20, 50])
async def test_cold_partial_and_warm_cache_for_different_crowd_sizes(count):
    candidates = tuple(HELPER.model_copy(update={'user_id': f'candidate-{index}'}) for index in range(count))
    gateway = HeldGateway()
    gateway.release.set()
    subject = bridge(gateway)
    try:
        # Part of the crowd was already evaluated on a previous scan.
        warm = candidates[:max(1, count // 2)]
        await annotate(subject, candidates=warm)
        await drain(subject)
        first_calls = len(gateway.calls)
        partial = await annotate(subject, candidates=candidates)
        assert sum(r['status'] == 'ready' for r in partial.values()) == len(warm)
        await drain(subject)
        assert Counter(c for call in gateway.calls for c in call) == {c.user_id: 1 for c in candidates}
        assert len(gateway.calls) == first_calls + (len(candidates) - len(warm) + 4) // 5
        result = await annotate(subject, candidates=candidates)
        await drain(subject)
        assert all(r['status'] == 'ready' for r in result.values())
        assert len(gateway.calls) == first_calls + (len(candidates) - len(warm) + 4) // 5
        assert sorted(r['rank'] for r in result.values()) == list(range(count))
    finally:
        await subject.aclose()


async def test_redis_outage_retains_local_deduplication():
    class BrokenRedis:
        async def set(self, *args, **kwargs):
            raise ConnectionError('offline Redis outage')
        async def eval(self, *args, **kwargs):
            raise ConnectionError('offline Redis outage')
    gateway = HeldGateway()
    subject = bridge(gateway, BrokenRedis())
    try:
        await annotate(subject)
        await wait_calls(gateway, 1)
        await annotate(subject)
        gateway.release.set()
        await drain(subject)
        assert len(gateway.calls) == 1
        assert not subject._inflight
    finally:
        await subject.aclose()


@pytest.mark.parametrize('changed', ['none', 'viewer', 'candidate', 'expired'])
async def test_stale_or_expired_evaluations_do_not_emit_notifications(changed):
    gateway = HeldGateway()
    gateway.release.set()
    subject = bridge(gateway)
    result = await subject._service.recommend(request_with(HELPER))
    assert result.notification_candidate_ids == (HELPER.user_id,)
    class Store:
        async def get_user(self, user_id):
            return {'discovery_enabled': '1', 'revision': VIEWER.profile_revision + (changed == 'viewer')}
        def revision_of(self, user):
            return user['revision']
        async def observed_snapshots(self, user_id, ids):
            return [] if changed == 'expired' else [dict(user_id=HELPER.user_id, profile_revision=HELPER.profile_revision + (changed == 'candidate'), profile={'nickname': '도움'})]
    class Push:
        enabled = True
        def __init__(self):
            self.sent = []
        async def claim_once(self, *args):
            return True
        def recommendation(self, *args):
            self.sent.append(args)
    subject._store, subject._push = Store(), Push()
    try:
        await subject._notify(VIEWER, result)
        assert len(subject._push.sent) == (1 if changed == 'none' else 0)
    finally:
        await subject.aclose()
