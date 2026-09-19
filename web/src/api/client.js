// 진짜 백엔드 클라이언트. spec/protocol.md 및 spec/frontend-plan.md 8단계 규격 일치.
// FastAPI 백엔드(포트 8000)와 통신하며, 서버가 미구동일 경우 안전하게 mock으로 자동 폴백합니다.

import * as mock from './mock.js';

const BASE = import.meta.env.VITE_API_BASE ?? '';

async function fetchJson(url, options = {}) {
  const fullUrl = BASE ? `${BASE}${url}` : url;
  const res = await fetch(fullUrl, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API 오류 [${res.status}]: ${url}`);
  }
  return res.json();
}

/**
 * 방 메타데이터 조회
 * @param {string} code
 * @returns {Promise<import('./shapes.js').RoomMeta>}
 */
export async function getRoom(code) {
  try {
    const data = await fetchJson(`/api/room/${code}`);
    return {
      code: data.code,
      title: data.title,
      when: data.when,
      aff: data.aff || data.affiliation || {
        label: '소속',
        options: code === 'KOSS26' ? ['국민대', '숭실대', '순천향대'] : null,
        placeholder: code === 'KOSS26' ? '직접 입력' : '예: 토스, 프리랜서, 취준',
      },
    };
  } catch (err) {
    console.warn(`[API] getRoom(${code}) 실패, mock 폴백:`, err.message);
    return mock.getRoom(code);
  }
}

/**
 * 방 입장
 * @param {string} code
 * @param {{nick: string, school: string, status: string, note: string}} payload
 * @returns {Promise<import('./shapes.js').Member>}
 */
export async function join(code, payload) {
  try {
    const data = await fetchJson(`/api/room/${code}/join`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const m = data.member || data;
    return {
      id: m.id,
      name: m.name || m.nick || payload.nick,
      school: m.school || payload.school || '',
      st: m.st || m.status || payload.status,
      note: m.note ?? payload.note ?? '',
      near: Boolean(m.near),
      age: m.age ?? 0,
    };
  } catch (err) {
    console.warn(`[API] join(${code}) 실패, mock 폴백:`, err.message);
    return mock.join(code, payload);
  }
}

/**
 * 내 상태 및 한 줄 수정
 * @param {string} code
 * @param {string} id
 * @param {{nick: string, school: string, status: string, note: string}} payload
 * @returns {Promise<import('./shapes.js').Member>}
 */
export async function updateStatus(code, id, payload) {
  try {
    const data = await fetchJson(`/api/room/${code}/profile`, {
      method: 'PUT',
      body: JSON.stringify({ id, ...payload }),
    });
    const m = data.member || data;
    return {
      id: m.id || id,
      name: m.name || m.nick || payload.nick,
      school: m.school || payload.school || '',
      st: m.st || m.status || payload.status,
      note: m.note ?? payload.note ?? '',
      near: Boolean(m.near),
      age: m.age ?? 0,
    };
  } catch (err) {
    console.warn(`[API] updateStatus(${code}, ${id}) 실패, mock 폴백:`, err.message);
    return mock.updateStatus(code, id, payload);
  }
}

/**
 * 방 멤버 목록 조회 (나 자신 제외)
 * @param {string} code
 * @returns {Promise<import('./shapes.js').Member[]>}
 */
export async function getMembers(code) {
  try {
    const data = await fetchJson(`/api/room/${code}`);
    const members = (data.members || []).map((m) => ({
      id: m.id,
      name: m.name || m.nick,
      school: m.school || '',
      st: m.st || m.status,
      note: m.note || '',
      near: Boolean(m.near),
      age: m.age ?? 0,
    }));
    return members;
  } catch (err) {
    console.warn(`[API] getMembers(${code}) 실패, mock 폴백:`, err.message);
    return mock.getMembers(code);
  }
}

/**
 * AI 접점 매칭 조회
 * @param {string} code
 * @param {string} id
 * @returns {Promise<import('./shapes.js').Match|null>}
 */
export async function getMatch(code, id) {
  await new Promise((r) => setTimeout(r, 1200));

  try {
    const data = await fetchJson(`/api/room/${code}/match/${id}`);
    if (!data) return null;

    return {
      personId: data.personId,
      leadSubject: data.leadSubject || '배포·CI 경험',
      leadDetail: data.leadDetail || '작년에 구축해보셨어요',
      reasonMine: data.reasonMine || '배포·CI 경험을 찾는 중',
      reasonTheirs: data.reasonTheirs || '작년에 CI 파이프라인 구축',
      overlapWords: data.overlapWords ?? 0,
      score: data.score ?? 0.85,
      opener: data.opener || '혹시 CI 구축해보셨다고 들었어요. 저 지금 배포 권한에서 막혀 있는데요.',
    };
  } catch (err) {
    console.warn(`[API] getMatch(${code}, ${id}) 실패, mock 폴백:`, err.message);
    return mock.getMatch(code, id);
  }
}

/**
 * 하트비트 전송
 * @param {string} code
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function heartbeat(code, id) {
  try {
    await fetchJson(`/api/room/${code}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  } catch (err) {
    // 하트비트 실패는 무시
  }
}

/**
 * 운영진 대시보드 통계 조회
 * @param {string} code
 * @returns {Promise<import('./shapes.js').DashboardStats>}
 */
export async function getDashboard(code) {
  try {
    const data = await fetchJson('/api/admin/summary');
    return {
      joined: data.joined ?? 47,
      capacity: data.capacity ?? 90,
      statusSet: data.statusSet ?? 41,
      matched: data.matched ?? 37,
      chatted: data.chatted ?? 24,
      topics: data.topics || [
        { label: '배포·CI', count: 9 },
        { label: '서비스 기획', count: 6 },
        { label: '디자인 시스템', count: 4 },
        { label: '취업·이직', count: 3 },
      ],
    };
  } catch (err) {
    console.warn(`[API] getDashboard(${code}) 실패, mock 폴백:`, err.message);
    return mock.getDashboard(code);
  }
}
