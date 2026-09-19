// BLE 채팅 목업. api/ 밑에 안 두는 이유: 실제로는 서버 HTTP를 거치지 않는다
// (spec/protocol.md 0번 — "그 대화는 서버를 거치지 않는다. 기기와 기기가 직접
// 주고받는다"). api/client.js가 채워질 때도 이 파일은 안 바뀐다. 9단계에서
// Capacitor BLE GATT 호출로 통째로 갈아끼울 자리다 — 그때도 함수 이름·모양은
// 최대한 유지한다(getInitialMessages/sendMessage).
//
// prototype의 CHAT0(801~805줄)·send()(827~832줄)를 그대로 옮겼다.
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const SEED = [
  { me: true, t: '혹시 CI 구축해보셨다고 들었어요. 저 지금 배포 권한에서 막혀 있는데요' },
  { me: false, t: '아 네 작년에요. 어떤 에러예요?' },
  { me: true, t: 'Actions에서 빌드는 되는데 배포 단계에서 권한 오류가 나요' },
];

/** 대화방을 열 때 이미 오간 것처럼 보여줄 초기 메시지. 실제 BLE에선 처음엔 빈 방이다 */
export async function getInitialMessages() {
  await delay(120);
  return SEED.map((m) => ({ ...m }));
}

/** 내가 보낸 메시지 하나. BLE라면 그냥 GATT write — 여기서도 즉시 반영한다 */
export async function sendMessage(text) {
  await delay(60);
  return { me: true, t: text };
}

/** 상대가 보낸 것처럼 보이는 응답. 실제로는 상대 기기가 보낸다 — 데모 전용 */
export async function fakeReply() {
  await delay(900);
  return { me: false, t: '창가 쪽에 있어요. 손 들게요' };
}
