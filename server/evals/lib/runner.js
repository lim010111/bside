// 운영 모듈(server/app/ai)을 자식 프로세스로 돌린다. 평가용 프롬프트를 따로 만들지 않는다.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EVALS = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(EVALS, '..');

export function callModule(payload, timeoutMs = 300000) {
  const proc = spawnSync('uv', ['run', '--quiet', 'python', 'evals/providers/bridge.py'], {
    cwd: SERVER,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (proc.error) throw new Error(`브리지 실행 실패: ${proc.error.message}`);
  const stdout = (proc.stdout ?? '').trim();
  const lastLine = stdout.split('\n').filter(Boolean).pop();
  if (!lastLine) throw new Error(`브리지 출력 없음. stderr: ${(proc.stderr ?? '').slice(-500)}`);
  let parsed;
  try {
    parsed = JSON.parse(lastLine);
  } catch {
    throw new Error(`브리지 출력이 JSON 이 아님: ${lastLine.slice(0, 300)}`);
  }
  if (parsed.bridge_error) throw new Error(`브리지 오류: ${parsed.bridge_error}`);
  return parsed;
}
