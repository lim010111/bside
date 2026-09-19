// 스위치. 화면 코드는 이 파일만 import한다 — mock.js/client.js를 직접 참조하지 않는다.
// .env에서 VITE_USE_MOCK=0으로 바꾸면 진짜 백엔드로 넘어간다 (8단계).
import * as mock from './mock.js';
import * as client from './client.js';

const useMock = import.meta.env.VITE_USE_MOCK !== '0';
export const api = useMock ? mock : client;

// 화면에서 상태 정의(STATUSES)나 방 설정(ROOMS)을 그릴 때 필요한 상수도
// 여기서 같이 내보낸다. mock 전용이지만 이번 제출 범위에선 서버가 바뀌어도
// 상태 4종은 고정이라(protocol.md 2번) client.js로 옮길 때 그대로 재사용한다.
export { STATUSES, SL, SHORT, ROOMS } from './mock.js';
