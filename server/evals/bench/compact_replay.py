"""Compare lossless wire compression by replaying saved Haiku evaluations.

Usage from server/: .venv/bin/python evals/bench/compact_replay.py --output PATH
No provider client, credentials or network. This measures JSON size and contract
preservation, not new prompt quality, tokenizer counts or generation latency.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

EVALS = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(EVALS.parent), str(EVALS)]

from app.ai import AISettings, RecommendationService
from app.ai.prompt import DefaultPromptProvider
from harness.fixtures import load_case, to_request

SOURCES = {'viewer_self_description': 'vs', 'viewer_connection_intent': 'vi',
           'candidate_self_description': 'cs', 'candidate_connection_intent': 'ci'}


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def raw(item):
    return dict(candidate_id=item['candidate_user_id'], status=item['status'].lower(),
                score=item['score'], reason=item['reason'], intent_conflict=item['intent_conflict'],
                evidence=[dict(source=e['source'].lower(), quote=e['quote']) for e in item['excerpts']])


def compact(item):
    return dict(id=item['candidate_id'], t='ok' if item['status'] == 'evaluated' else 'insufficient',
                s=item['score'], r=item['reason'], c=item['intent_conflict'],
                e=[[SOURCES[e['source']], e['quote']] for e in item['evidence']])


class ReplayGateway:
    def __init__(self, entries):
        self.entries = entries
        self.wire = []

    async def complete(self, *, system, user):
        ids = [candidate['candidate_id'] for candidate in json.loads(user)['candidates']]
        response = dump(dict(recommendations=[self.entries[value] for value in ids]))
        self.wire.append(response)
        return response

    async def aclose(self):
        pass


async def run():
    settings = AISettings(_env_file=None, api_key='offline-unused', model='replay',
                          base_url='https://example.invalid/v1', batch_size=5,
                          max_concurrent_requests=4, max_output_tokens=4096)
    rows = []
    omitted = []
    for filename in ['live-targeted-prompt2.json', 'live-targeted-fresh.json']:
        path = EVALS / 'results' / filename
        for row in json.loads(path.read_text())['results']['results']:
            if row['provider']['id'] != 'module:live:claude-haiku-4-5':
                continue
            case_id = row['vars']['case_id']
            if 'output' not in row['response']:
                omitted.append(dict(file=filename, case_id=case_id, reason='no stored output'))
                continue
            stored = json.loads(row['response']['output'])
            if stored['prompt_digest'] != '32db67109c375cf1':
                continue
            request = to_request(load_case(case_id)['request'])
            entries = {item['candidate_user_id']: raw(item) for item in stored['recommendations']}
            variants = [ReplayGateway(entries), ReplayGateway({key: compact(value) for key, value in entries.items()})]
            results = []
            for gateway in variants:
                async with RecommendationService(settings, gateway=gateway) as service:
                    results.append(await service.recommend(request))
            assert results[0].recommendations == results[1].recommendations, case_id
            assert results[0].anomalies == results[1].anomalies, case_id
            sizes = [dict(chars=sum(len(value) for value in gateway.wire),
                          utf8_bytes=sum(len(value.encode('utf-8')) for value in gateway.wire)) for gateway in variants]
            rows.append(dict(file=filename, case_id=case_id, candidates=len(request.candidates),
                             identical_recommendations=True, identical_anomalies=True,
                             legacy=sizes[0], compact=sizes[1]))
    assert len(rows) == 7 and sum(row['candidates'] for row in rows) == 33
    totals = {variant: {measure: sum(row[variant][measure] for row in rows)
                       for measure in ('chars', 'utf8_bytes')} for variant in ('legacy', 'compact')}
    return dict(mode='offline saved-response replay', live_generation_calls=0,
                source_prompt_digest='32db67109c375cf1', current_prompt_digest=DefaultPromptProvider().digest,
                note='Reconstructed model fields, compact JSON including batch envelopes. Text, scores and quotes unchanged. Not raw original bytes, tokenizer counts, generation latency, or new-prompt quality.',
                totals=totals, reduction_percent={measure: round(100 * (1 - totals['compact'][measure] / totals['legacy'][measure]), 2)
                                                  for measure in ('chars', 'utf8_bytes')},
                cases=rows, omitted=omitted)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = asyncio.run(run())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ('live_generation_calls', 'current_prompt_digest', 'totals', 'reduction_percent')}, ensure_ascii=False, indent=2))
