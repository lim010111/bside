/** promptfoo 커스텀 제공자: 결정론적 기준선. 모델 호출도 네트워크도 없다. */
import { loadCase } from '../lib/fixtures.js';
import { runRuleBaseline } from '../lib/baseline_rule.js';
import { runLexicalBaseline } from '../lib/baseline_lexical.js';
import { emptyRecommendation, result as makeResult } from '../lib/normalize.js';

const KINDS = { rule: runRuleBaseline, lexical: runLexicalBaseline };

export default class BaselineProvider {
  constructor(options = {}) {
    this.kind = options.config?.kind ?? 'lexical';
    this.run = KINDS[this.kind];
    if (!this.run) throw new Error(`알 수 없는 기준선 종류: ${this.kind}`);
  }

  id() {
    return `baseline:${this.kind}`;
  }

  async callApi(prompt, context) {
    const caseId = context?.vars?.case_id ?? JSON.parse(prompt).case_id;
    const fixture = loadCase(caseId);
    // 기준선에는 게이트웨이가 없다. 실패 주입 사례는 '호출할 것이 없어 전부 실패'로 둔다.
    if (fixture.request.fault) {
      const recs = fixture.request.candidates.map((c) =>
        emptyRecommendation(c, fixture.request.viewer, { status: 'FAILED', failure_code: 'GATEWAY_TIMEOUT' }),
      );
      return { output: JSON.stringify(makeResult(fixture.request, recs, { policy_version: `baseline-${this.kind}` })) };
    }
    return {
      output: JSON.stringify(this.run(fixture.request)),
      metadata: { kind: this.kind, deterministic: true, gateway_calls: 0 },
    };
  }
}
