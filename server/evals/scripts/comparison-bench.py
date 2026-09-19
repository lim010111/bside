"""Resumable paired benchmark; explicit --live, phase persistence and ledger accounting."""
import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

EVALS = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(EVALS.parent), str(EVALS)]
from app.ai import AISettings, InMemoryRecommendationCache, OpenAICompatibleGateway, RecommendationService
from app.ai.prompt import DefaultPromptProvider
from bench.bench import build_request, sample

CONFIG = json.loads((EVALS / 'scripts/comparison-config.json').read_text())
LEDGER = EVALS / 'results/live-budget.json'
OUT = EVALS / 'results/comparison-bench-2026-09-20.json'
MARKER = OUT.with_suffix('.inflight')

def save(path, data):
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(data, indent=2) + '\n')
    temp.replace(path)

def account(label, run):
    ledger = json.loads(LEDGER.read_text())
    if any(e['label'] == label for e in ledger['entries']):
        return
    ledger['generation_requests'] += run['gateway_calls']
    ledger['cap'] = 240
    ledger['remaining'] = 240 - ledger['generation_requests']
    ledger['entries'].append(dict(at=run['at'], label=label, gateway_calls=run['gateway_calls'], kind='comparison-benchmark'))
    save(LEDGER, ledger)

async def main():
    data = json.loads(OUT.read_text()) if OUT.exists() else {'config': CONFIG, 'models': {}}
    assert data['config'] == CONFIG, 'Saved/current config mismatch'
    quality = json.loads((EVALS / 'results/comparison-quality-2026-09-20.json').read_text())
    assert quality['config'] == CONFIG, 'Quality/current config mismatch'
    if '--live' not in sys.argv:
        print('Saved benchmark phases:', {m: len(r) for m, r in data['models'].items()})
        return
    assert os.environ.get('EVAL_LIVE_CALL_CAP') == '240'
    # Only explicit live mode may reconcile saved phase accounting.
    for model, runs in data['models'].items():
        for run in runs:
            account(f"comparison:{model}:{run['repeat']}:{run['phase']}", run)
    assert DefaultPromptProvider().digest == CONFIG['prompt_digest']
    if MARKER.exists():
        raise SystemExit('Interrupted phase: manually reconcile before resuming; no automatic paid retry')
    request = build_request()
    data['input_candidate_order'] = [c.user_id for c in request.candidates]
    for model in CONFIG['models']:
        if model in data.get('skipped', {}):
            print('Saved benchmark stop', model, data['skipped'][model], flush=True)
            continue
        if model in quality.get('stopped', {}):
            data.setdefault('skipped', {})[model] = quality['stopped'][model]
            save(OUT, data)
            print('SKIP benchmark', model, quality['stopped'][model], flush=True)
            continue
        runs = data['models'].setdefault(model, [])
        severe_streak = 0
        for repeat in range(3):
            existing = [r for r in runs if r['repeat'] == repeat]
            if len(existing) == 2:
                assert {r['phase'] for r in existing} == {'cold', 'warm'}
                continue
            if existing:
                raise SystemExit('Cold phase saved but warm missing: cache lost; do not repeat paid cold automatically')
            ledger = json.loads(LEDGER.read_text())
            assert ledger['generation_requests'] + 8 <= 240, 'Cold+warm worst-case preflight exceeds cap'
            settings = AISettings(model=model, **CONFIG['settings'])
            gateway = OpenAICompatibleGateway(settings)
            try:
                async with RecommendationService(settings, cache=InMemoryRecommendationCache(), gateway=gateway) as service:
                    for phase in ['cold', 'warm']:
                        save(MARKER, {'model': model, 'repeat': repeat, 'phase': phase})
                        started = time.perf_counter()
                        result = await service.recommend(request)
                        run = sample(result, (time.perf_counter()-started)*1000, repeat)
                        run.update(phase=phase, at=datetime.now(timezone.utc).isoformat(), prompt_digest=result.prompt_digest, inference_digest=result.inference_digest)
                        runs.append(run)
                        save(OUT, data)
                        account(f'comparison:{model}:{repeat}:{phase}', run)
                        MARKER.unlink()
                        print(model, repeat, phase, json.dumps(run), flush=True)
            except Exception:
                # An unsaved phase may have dispatched up to four batches. Keep
                # its marker and reserve that bound; actual calls remain unknown.
                if MARKER.exists() and not any(r['repeat'] == repeat and r['phase'] == phase for r in runs):
                    ledger = json.loads(LEDGER.read_text())
                    label = f'comparison:{model}:{repeat}:{phase}:unknown-reservation'
                    if not any(e['label'] == label for e in ledger['entries']):
                        ledger['generation_requests'] += 4
                        ledger['cap'] = 240
                        ledger['remaining'] = 240 - ledger['generation_requests']
                        ledger['entries'].append(dict(label=label, gateway_calls=4, actual_calls=None, accounting='conservative-upper-bound', at=datetime.now(timezone.utc).isoformat()))
                        save(LEDGER, ledger)
                raise
            finally:
                await gateway.aclose()
            severe = {'GATEWAY_HTTP_ERROR', 'GATEWAY_NETWORK_ERROR', 'INVALID_JSON', 'SCHEMA_MISMATCH', 'OUTPUT_TRUNCATED'}
            for run in runs[-2:]:
                severe_streak = severe_streak + 1 if sum(run['failure_codes'].get(k, 0) for k in severe) == 20 else 0
            if severe_streak >= 2:
                data.setdefault('skipped', {})[model] = 'Remaining repeats stopped: two phases entirely failed with HTTP/network/format codes'
                save(OUT, data)
                break

if __name__ == '__main__':
    asyncio.run(main())
