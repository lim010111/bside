// 실사용 게이트웨이 호출(배치) 예산 장부.
// 후보 6명이 배치 크기 5면 호출 2건이다. 사례 수가 아니라 실제 배치 호출 수를 센다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = join(ROOT, 'results', 'live-budget.json');
const CAP = Number(process.env.EVAL_LIVE_CALL_CAP ?? 80);

function load() {
  if (!existsSync(LEDGER)) return { cap: CAP, generation_requests: 0, entries: [] };
  const data = JSON.parse(readFileSync(LEDGER, 'utf8'));
  data.cap = CAP;
  return data;
}

export function spent() {
  return load().generation_requests;
}

export function remaining() {
  return CAP - spent();
}

/** 호출 전 확인. 남은 예산이 부족하면 던진다. */
export function assertAffordable(expected, label) {
  const left = remaining();
  if (expected > left)
    throw new Error(`실사용 예산 초과: ${label} 에 배치 호출 ${expected}건이 필요한데 남은 예산은 ${left}건 (상한 ${CAP}). 사용자에게 알리고 상한을 조정해야 합니다.`);
}

/** 실제 호출 후 기록. gateway_calls 는 모듈이 보고한 실제 배치 수다. */
export function record(label, gatewayCalls, extra = {}) {
  mkdirSync(dirname(LEDGER), { recursive: true });
  const data = load();
  data.generation_requests += gatewayCalls;
  data.entries.push({ at: new Date().toISOString(), label, gateway_calls: gatewayCalls, ...extra });
  data.remaining = CAP - data.generation_requests;
  writeFileSync(LEDGER, JSON.stringify(data, null, 2) + '\n');
  return data.generation_requests;
}
