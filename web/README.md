# Bside 프론트엔드

React 19 · Vite · JavaScript/JSX. 화면과 데이터 경계는 [개발 기준](../docs/development-contract.md), [API 계약 v0.1](../docs/api-contract.md), [OpenAPI](../docs/openapi.yaml), [화면 명세](../spec/design.md)를 따른다.

주변에 있는 사람을 BLE로 발견하고, 자기소개와 교류 의도를 바탕으로 별도 수락 없이 바로 대화를 시작하는 앱의 UI다. **행사 방·QR 입장·운영자 종료·요청/수락은 이 모델에 없다.** 이전 행사 MVP 구현은 [이력](../docs/history/event-mvp/)에 보존한다.

## 실행과 빌드

```sh
npm ci
npm run dev
npm run lint
npm test
npm run build
```

- `npm run dev`: 브라우저에 저장하는 데모. **실제 BLE가 아니라 예시 데이터이며 화면에 그렇게 표시한다.** 예시 참가자는 답장하지 않는다.
- `npm run build`: 실제 HTTP API를 사용하는 `dist/`. 데모 어댑터와 예시 참가자 데이터는 번들에 포함하지 않는다.
- `npm run build:demo`: 명시적인 데모 빌드 `dist-demo/`.
- 실제 서버에 연결하려면 `.env.example`을 `.env.local`로 복사하고 `VITE_USE_MOCK=0`을 사용한다. Vite가 `/api`를 `http://127.0.0.1:8000`으로 프록시한다.

화면은 `#nearby`, `#profile`, `#detail/{id}`, `#chat/{id}`, `#conversations`로 구분하며 새로고침·뒤로가기를 지원한다.

## v0.1 계약이 프론트 구조를 정한 부분

계약에 **없는 것**들이 이 코드의 모양을 결정했다. 편의를 위해 임의로 만들어 쓰지 않는다.

| 계약에 없음 | 프론트가 택한 방식 |
| --- | --- |
| `GET /discovery/nearby` | 주변 목록은 **네이티브의 관측 보고 응답**으로만 생긴다. 화면이 조회하지 않고 네이티브가 밀어준다 |
| `GET /users/{id}` | 상세는 마지막 관측 응답을 메모리에서 읽는다. 화면을 다시 그리기 위한 캐시일 뿐 근접의 증거가 아니다 |
| `before_seq` | 이력은 `after_seq=0`부터 앞으로만 읽는다. "이전 메시지 보기" 조작이 없다 |
| SSE·WebSocket | 실시간 전달이 없다. 네이티브 관측 푸시 + 화면이 보일 때의 폴링으로 갱신한다 |
| `profile_revision` 등 내부 버전 | 클라이언트 낙관적 충돌 검사가 없다. 프로필은 전체 덮어쓰기이고 같은 값 재전송은 no-op다 |
| 쿠키 인증 | `Authorization: Bearer <installation_credential>`. 자격 증명은 네이티브 보호 저장소에서 가져온다 |

또한 **v0.1의 추천 상태는 항상 `unavailable`**이다. 화면은 "AI 추천은 아직 준비 중"이라고 적고, 준비되지 않은 것을 준비된 것처럼 보이게 하지 않는다.

## 구현 범위

- 설치·복원: `installation_request_id`를 보관해 응답이 유실돼도 같은 자격 증명을 재발급받는다. 재실행 시 같은 설치 사용자로 복원한다.
- 첫 실행·수정: 세 필드 전체 저장, Unicode 코드 포인트 한도, 서버 `details.field` 오류를 해당 입력에 표시.
- 주변 목록: 발견 ON/OFF와 실제 작동 상태를 나눠 표시, 검색, 관측 순 정렬, 관측된 사람 전체 유지.
- 상세: 자기소개·만나고 싶은 사람. 관측에서 사라지면 현재 상태를 말하고 기존 대화는 그대로 연다.
- 발견 ON/OFF: 끄면 새 발견과 **새 상대와의** 대화 시작만 멈춘다. 이미 시작한 대화는 이력 조회·송수신을 유지한다.
- 대화: 상대별 목록·이력 따라잡기, 초안 유지, 전송 실패 재시도 시 같은 `client_message_id` 재사용, `message_id` 중복 제거, `seq` 정렬.
- 접근성·모바일: 입력 라벨, 오류 알림, 키보드 포커스, 한글 조합 중 Enter 전송 방지, 긴 문장 줄바꿈, viewport·safe area, 줄어든 동작 설정.

신규 설치는 계약대로 `discovery_enabled: false`로 시작한다. 소개를 저장했다고 BLE 광고를 자동으로 켜지 않는다 — 켜는 것은 주변 목록에서의 명시적인 선택이다.

## 네이티브 경계

[`src/lib/native.js`](src/lib/native.js)가 Capacitor `Discovery` 플러그인과의 계약이다. 네이티브가 맡는 것은 세 가지다.

1. 설치 자격 증명의 보호된 저장 (`getCredential` / `setCredential`)
2. BLE 광고·스캔과 임시 ID 회전 (`POST /discovery/identifiers`)
3. 백그라운드 관측 보고 (`POST /discovery/observations`)와 추천 알림

JS는 스캔 타이머를 돌리지 않고 BLE 임시 ID를 보지도 않는다. 참여 의사를 내려보내고(`start`/`stop`), 실제 작동 상태를 되읽고(`getStatus`, `statusChanged`), 관측 결과를 받는다(`observations`, `refreshObservations`).

지속 ON은 **의사**이고 권한·Bluetooth·OS 제한은 **실제 작동**이다. 둘을 화면에서 분리하며, 권한이 막혔다고 참여 설정을 대신 끄지 않는다. 플러그인이 없는 브라우저에서는 `supported: false`로 보고하고 화면에 그렇게 적는다.

## 데이터와 서버 연결

[`api/client.js`](src/api/client.js)가 v0.1 HTTP 어댑터다. 경로·필드·오류 코드는 OpenAPI를 따른다.

[`api/mock.js`](src/api/mock.js)는 같은 계약을 흉내 내는 **서버** 데모이고, [`api/demo.js`](src/api/demo.js)의 `createDemoBridge`가 **라디오** 데모다. 둘을 합치면 브라우저에서도 `스캔 → 관측 보고 → observed_users` 경로가 실제와 같이 돈다. 임시 ID 회전·10분 권한 창·멱등성까지 계약대로 흉내 내며, `localStorage`의 `bside:demo:v4:*` 키를 쓴다. 추천은 계산하지 않는다(항상 `unavailable`).

**`server/`의 제품 API는 아직 미구현이다.** 프론트 호출부 구현과 실제 서버 통합 완료는 구분한다.

## 구조

```text
src/
  api/client.js          v0.1 HTTP 어댑터
  api/mock.js            계약을 흉내 내는 데모 서버
  api/demo.js            데모 클라이언트 + 데모 라디오
  api/shapes.js          공통 JSDoc과 "계약에 없는 것" 기록
  lib/contracts.js       입력 한도, 정렬, 근접 권한 창, 메시지 병합
  lib/credentials.js     설치 자격 증명 보관 (네이티브 우선)
  lib/native.js          Capacitor 플러그인 브리지와 작동 안내 문구
  discovery-controller.js 비동기 요청 소유권, 상태 reducer, 관측 수신·전송
  state.jsx              React reducer·Context 연결과 브라우저 수명
  components/            공통 헤더·오류·로딩·참가자 카드·발견 패널
  screens/               첫 실행·주변 목록·상세·대화 목록·채팅
tests/                   Node 내장 테스트 러너로 계약·실패·응답 경합 검증
```

[검증 기록](VERIFICATION.md)에 실행 범위와 서버·실기기 미검증 항목을 기록한다. 테스트·빌드 성공만으로 실기기 통신 완료를 주장하지 않는다.
