// fixtures/cases/*.json 에서 promptfoo 테스트 목록을 만든다.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listCases, loadCase } from '../lib/fixtures.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rows = listCases()
  .map((id) => {
    const fixture = loadCase(id);
    return (
      `- description: ${JSON.stringify(`${id} — ${fixture.title}`)}\n` +
      `  vars:\n    case_id: ${id}\n    set: ${fixture.set}\n` +
      `  assert:\n    - type: javascript\n      value: file://asserts/checks.js\n`
    );
  })
  .join('');
writeFileSync(
  join(ROOT, 'tests.generated.yaml'),
  '# 생성 파일. scripts/generate_tests.js 가 fixtures/cases 에서 만든다. 직접 고치지 않는다.\n' + rows,
);
console.log(`테스트 ${listCases().length}건 생성`);
