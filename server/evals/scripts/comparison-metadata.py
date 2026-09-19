"""Offline expected metadata, using production settings/digest logic; no secrets."""
import json
import sys
from pathlib import Path
EVALS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(EVALS.parent))
from app.ai import AISettings, RecommendationService
from app.ai.prompt import DefaultPromptProvider
config = json.loads((EVALS / 'scripts/comparison-config.json').read_text())
prompt = DefaultPromptProvider()
assert (prompt.version, prompt.digest) == (config['prompt_version'], config['prompt_digest'])
result = {}
for model in [*config['models'], 'claude-haiku-4-5', 'deepseek-v3.2', 'fault-injection']:
    result[model] = {}
    for phase in ['basic', 'diagnostic']:
        overrides = dict(config['settings'])
        if phase == 'diagnostic':
            overrides.update(request_timeout_seconds=60, total_timeout_seconds=90)
        settings = AISettings(model=model, **overrides)
        result[model][phase] = {'inference_digest': RecommendationService(settings).inference_digest,
                                'settings': settings.model_dump(mode='json', exclude={'api_key'})}
print(json.dumps(result))
