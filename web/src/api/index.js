// 스위치. 화면 코드는 이 파일만 import한다 — mock.js/client.js를 직접 참조하지 않는다.
// .env에서 VITE_USE_MOCK=0으로 바꾸면 진짜 백엔드로 넘어간다 (T05).
import * as mock from './mock.js';
import * as client from './client.js';

const useMock = import.meta.env.VITE_USE_MOCK !== '0';
export const api = useMock ? mock : client;
