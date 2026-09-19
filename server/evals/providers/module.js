/**
 * promptfoo 커스텀 제공자: 운영 AI 모듈(server/app/ai)을 그대로 호출한다.
 *
 * config.mode: 'scripted'(오프라인, 모델 아님) | 'live'(실제 게이트웨이)
 * config.model: live 모드에서 쓸 모델 ID
 *
 * fault 가 있는 사례는 모드와 무관하게 실패 주입 경로로 돌린다. 실패 사례에 실제 호출을
 * 쓰면 예산만 쓰고 검증하려는 경로를 지나지 않는다.
 */
import { loadCase } from '../lib/fixtures.js';
import { callModule } from '../lib/runner.js';
import { assertAffordable, record } from '../lib/budget.js';

export default class ModuleProvider {
  constructor(options = {}) {
    this.config = options.config ?? {};
    this.onResult = options.onResult;
    this.mode = this.config.mode ?? 'scripted';
    this.model = this.config.model ?? null;
  }

  id() {
    return this.mode === 'live' ? `module:live:${this.model}` : 'module:scripted';
  }

  async callApi(prompt, context) {
    const caseId = context?.vars?.case_id ?? JSON.parse(prompt).case_id;
    const fixture = loadCase(caseId);
    const fault = fixture.request.fault;
    const live = this.mode === 'live' && !fault;

    if (live) {
      // 사전 확인은 최악의 경우로 잡는다. 재시도를 세지 않으면 실제 결제 요청이 확인보다
      // 많아져 상한을 넘길 수 있다. 실효 배치 크기는 설정을 덮어쓴 값이 우선이다.
      const overrides = this.config.settings ?? {};
      const batchSize = Number(overrides.batch_size ?? this.config.batch_size ?? 5);
      const maxAttempts = Number(overrides.max_attempts ?? this.config.max_attempts ?? 1);
      const batches = Math.ceil(fixture.request.candidates.length / Math.max(1, batchSize));
      assertAffordable(batches * Math.max(1, maxAttempts), `${caseId}@${this.model}`);
    }

    const payload = {
      mode: fault ? 'module-fault' : live ? 'module-live' : 'module-scripted',
      model: live ? this.model : null,
      request: fixture.request,
      fault,
      cache: false,
      repeats: 1,
      // 설정을 덮어쓴 경우 그 값이 결과 메타데이터와 함께 기록된다. 기본값과 다른 조건으로
      // 측정한 사실을 숨기지 않기 위함이다.
      settings: this.config.settings ?? null,
    };

    let response;
    try {
      response = callModule(payload);
    } catch (error) {
      return { error: String(error.message ?? error) };
    }

    const result = response.result;

    const normalized = {
      output: JSON.stringify(result),
      cached: false,
      metadata: {
        mode: payload.mode,
        model: result.model,
        policy_version: result.policy_version,
        prompt_digest: result.prompt_digest,
        inference_digest: result.inference_digest,
        gateway_calls: result.gateway_calls,
        cache_hits: result.cache_hits,
        duration_ms: result.duration_ms,
        usage: result.usage,
        wall_ms: response.runs?.[0]?.wall_ms,
        anomalies: result.anomalies,
        settings_overrides: this.config.settings ?? null,
      },
    };
    // Persist the paid response before budget I/O can fail.
    if (this.onResult) await this.onResult(normalized);
    if (live) {
      record(`${caseId}@${this.model}`, result.gateway_calls ?? 0, {
        case_id: caseId,
        model: this.model,
        candidates: fixture.request.candidates.length,
        duration_ms: result.duration_ms,
      });
    }

    return normalized;
  }
}
