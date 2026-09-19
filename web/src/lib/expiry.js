// 만료 계산. prototype/index.html의 ageOf/lifeOf/fadeOf(642~646줄)를 그대로 옮긴 것.
// TTL은 protocol.md "만료 규칙"의 5분과 일치해야 한다.
export const TTL = 300; // 상태 유효시간(초)

/**
 * p.age(방에 들어온 뒤 지난 시간, 초)에 실제 경과 시간을 더한 "지금 나이".
 * now를 인자로 받는 이유: Room 화면이 1초마다 now를 한 번만 갱신해서 모든 카드에
 * 같이 흘려보낸다. 카드마다 각자 Date.now()를 부르면 46장이 따로 놀고, 리렌더도
 * 트리거되지 않는다.
 */
export function ageOf(p, t0, speed = 1, now = Date.now()) {
  return p.age + ((now - t0) / 1000) * speed;
}

/** 0(만료)~1(방금) 사이 생존율 */
export function lifeOf(p, t0, speed = 1, now = Date.now()) {
  return Math.max(0, 1 - ageOf(p, t0, speed, now) / TTL);
}

/** 지금 막 들어온 사람의 age. t0 기준이라 음수가 된다 (LATE 합류용) */
export function nowAge(t0, speed = 1) {
  return -((Date.now() - t0) / 1000) * speed;
}

/** life -> 카드 opacity. 남은 시간 45% 밑으로 떨어지면 바래기 시작한다 */
export function fadeOf(life) {
  return life > 0.45 ? 1 : 0.34 + (life / 0.45) * 0.66;
}
