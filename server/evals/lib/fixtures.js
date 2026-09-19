// 사례 로더. 조정용 풀과 보류 풀을 분리해 읽고, 보류 사례가 조정용 인물을 쓰면 거부한다.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const strip = (pool) => Object.fromEntries(Object.entries(pool).filter(([k]) => !k.startsWith('_')));

export const TUNING_POOL = strip(read('fixtures/participants.json'));
export const HELDOUT_POOL = strip(read('fixtures/participants_heldout.json'));
// 프롬프트 동결 후 새로 만든 보류 풀. 기존 보류(H01~H07)는 이미 결과를 본 뒤라 더 이상
// 신선하지 않으므로 파일을 따로 둔다.
export const FRESH_POOL = strip(read('fixtures/participants_fresh.json'));
const POOLS = { tuning: TUNING_POOL, heldout: HELDOUT_POOL, fresh: FRESH_POOL };

/**
 * 후보를 고정된 순서로 섞는다.
 *
 * 사례 파일에 적은 후보 순서는 사람이 읽기 좋게 '기대하는 상위 후보부터' 적혀 있다. 그런데 규칙
 * 기준선은 동점을 입력 순서로 깨기 때문에, 그대로 두면 기준선이 아무 판단 없이 1순위를 맞히는
 * 착시가 생긴다. 시드를 고정한 해시 정렬로 순서에서 정답 신호를 지우되, 실행할 때마다 같은
 * 순서가 나오게 한다.
 *
 * 시드는 case_id 가 아니라 shuffle_group 이다. 교류 의도만 바꾼 비교 쌍(E01/E02/E07,
 * H01/H02)은 후보 제시 순서까지 같아야 한다. 순서가 다르면 순위가 바뀐 원인이 의도 변경인지
 * 배치 맥락과 동점 처리의 차이인지 갈라낼 수 없다.
 */
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function shuffleDeterministically(candidates, seed) {
  return [...candidates].sort((a, b) => {
    const ha = fnv1a(`${seed}:${a.user_id}`);
    const hb = fnv1a(`${seed}:${b.user_id}`);
    return ha - hb || a.user_id.localeCompare(b.user_id);
  });
}

function resolve(entry, pool, caseId, role) {
  const base = pool[entry.ref];
  if (!base) throw new Error(`${caseId}: ${role} 참조 '${entry.ref}'가 해당 풀에 없습니다.`);
  const { ref, ...overrides } = entry;
  return { ...base, ...overrides };
}

/** 사례 파일을 실행 가능한 요청 + 기대값으로 펼친다. */
export function loadCase(caseId) {
  const body = read(`fixtures/cases/${caseId}.json`);
  // 사례는 선언한 풀만 쓴다. 섞이면 보류 성격이 사라진다.
  const pool = POOLS[body.pool] ?? TUNING_POOL;
  const viewer = resolve(body.request.viewer, pool, caseId, 'viewer');
  const authored = body.request.candidates.map((c) => resolve(c, pool, caseId, 'candidate'));
  const candidates = shuffleDeterministically(authored, body.shuffle_group ?? caseId);
  return {
    ...body,
    request: {
      viewer,
      candidates,
      policy: body.request.policy ?? {},
      fault: body.request.fault ?? null,
      case_id: caseId,
      authored_candidate_order: authored.map((c) => c.user_id),
      shuffle_group: body.shuffle_group ?? caseId,
    },
  };
}

export function listCases(set) {
  return readdirSync(join(ROOT, 'fixtures/cases'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .filter((id) => !set || read(`fixtures/cases/${id}.json`).set === set)
    .sort();
}

/** 조회자·후보가 실제로 쓴 원문 전체. 근거 검사의 유일한 출처다. */
export function sourceTexts(request) {
  const people = [request.viewer, ...request.candidates];
  return {
    all: people.map((p) => `${p.self_description} ${p.connection_intent}`).join(' '),
    byId: Object.fromEntries(
      request.candidates.map((c) => [
        c.user_id,
        {
          candidate: `${c.self_description} ${c.connection_intent}`,
          viewer: `${request.viewer.self_description} ${request.viewer.connection_intent}`,
        },
      ]),
    ),
  };
}
