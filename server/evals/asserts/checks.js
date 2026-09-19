/** promptfoo 단언: 사례의 기대값과 결과를 대조한다. 기대값은 사람 검토 전 가설이다. */
import { loadCase } from '../lib/fixtures.js';
import { runAllChecks } from '../lib/checks.js';

export default function assertCase(output, context) {
  const caseId = context?.vars?.case_id;
  const fixture = loadCase(caseId);
  let result;
  try {
    result = typeof output === 'string' ? JSON.parse(output) : output;
  } catch {
    return { pass: false, score: 0, reason: `제공자 출력이 JSON 이 아님: ${String(output).slice(0, 200)}` };
  }
  return runAllChecks(result, fixture.request, fixture.expectations);
}
