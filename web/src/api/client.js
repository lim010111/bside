// 진짜 백엔드. spec/protocol.md 5번 엔드포인트에 맞춘다.
// 8단계(백엔드 연결)에서 채운다. 함수 이름·인자·리턴 모양은 mock.js와 반드시 같아야
// 한다 — 화면 코드는 이 파일이 채워져도 한 줄도 안 바뀐다.
//
// 지금은 전부 미구현이다. VITE_USE_MOCK=0으로 바꾸면 바로 이 에러가 뜬다.

const BASE = import.meta.env.VITE_API_BASE ?? '';

function notImplemented(name) {
  throw new Error(
    `api/client.js: ${name}() 미구현. 8단계(백엔드 연결)에서 채운다. ` +
    `그 전까지는 .env에서 VITE_USE_MOCK=1을 유지할 것. BASE=${BASE || '(미설정)'}`
  );
}

export async function getRoom(_code) { notImplemented('getRoom'); }
export async function join(_code, _payload) { notImplemented('join'); }
export async function updateStatus(_code, _id, _payload) { notImplemented('updateStatus'); }
export async function getMembers(_code) { notImplemented('getMembers'); }
export async function getMatch(_code, _id) { notImplemented('getMatch'); }
export async function heartbeat(_code, _id) { notImplemented('heartbeat'); }
export async function getDashboard(_code) { notImplemented('getDashboard'); }
export async function getMe(_code, _id) { notImplemented('getMe'); }
