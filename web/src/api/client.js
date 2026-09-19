// 진짜 백엔드. docs/api-contract.md의 /api/* 경로에 맞춘다.
// T05(첫 실제 통합)에서 채운다. 함수 이름·인자·리턴 모양은 mock.js와 반드시
// 같아야 한다 — 화면 코드는 이 파일이 채워져도 한 줄도 안 바뀐다.
//
// 지금은 전부 미구현이다. VITE_USE_MOCK=0으로 바꾸면 바로 이 에러가 뜬다.

const BASE = import.meta.env.VITE_API_BASE ?? '';

function notImplemented(name) {
  throw new Error(
    `api/client.js: ${name}() 미구현. T05(첫 실제 통합)에서 채운다. ` +
    `그 전까지는 .env에서 VITE_USE_MOCK=1을 유지할 것. BASE=${BASE || '(미설정)'}`
  );
}

export async function getRoom(_code) { notImplemented('getRoom'); }
export async function closeRoom(_code) { notImplemented('closeRoom'); }
export async function join(_code, _payload) { notImplemented('join'); }
export async function getMe(_code, _id) { notImplemented('getMe'); }
export async function updateMe(_code, _id, _payload) { notImplemented('updateMe'); }
export async function stop(_code, _id) { notImplemented('stop'); }
export async function resume(_code, _id) { notImplemented('resume'); }
export async function getParticipants(_code, _viewerId) { notImplemented('getParticipants'); }
export async function getParticipant(_code, _viewerId, _targetId) { notImplemented('getParticipant'); }
export async function getRecommendations(_code, _viewerId) { notImplemented('getRecommendations'); }
export async function heartbeat(_code, _id) { notImplemented('heartbeat'); }
export async function getDashboard(_code) { notImplemented('getDashboard'); }
