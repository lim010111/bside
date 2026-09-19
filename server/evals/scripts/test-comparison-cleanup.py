"""Offline: injected gateway is closed even when evaluation raises."""
import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path[:0] = [str(Path(__file__).resolve().parents[2]), str(Path(__file__).resolve().parents[1])]
from providers import bridge
from bench import bench

class Gateway:
    closed = 0
    async def aclose(self):
        self.closed += 1

class BrokenService:
    def __init__(self, *args, **kwargs): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass
    async def recommend(self, request): raise RuntimeError('offline injected failure')

async def check():
    gateway = Gateway()
    payload = {'mode': 'module-scripted', 'request': {'viewer': {'user_id': 'v'}, 'candidates': []}}
    with patch.object(bridge, 'make_gateway', return_value=gateway), patch.object(bridge, 'RecommendationService', BrokenService):
        try: await bridge.run(payload)
        except RuntimeError: pass
    assert gateway.closed == 1
    gateway = Gateway()
    args = SimpleNamespace(mode='scripted',model='unused',max_output_tokens=4096,batch_size=5,concurrency=4,repeats=1)
    with patch.object(bench, 'ScriptedGateway', return_value=gateway), patch.object(bench, 'RecommendationService', BrokenService):
        try: await bench.measure(args)
        except RuntimeError: pass
    assert gateway.closed == 1
    print('PASS bridge and benchmark close injected gateway on failure')

asyncio.run(check())
