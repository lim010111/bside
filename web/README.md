# Bside 프론트엔드

React 19 · Vite · JavaScript/JSX. 화면과 데이터 경계는 [개발 기준](../docs/development-contract.md), [API 계약](../docs/api-contract.md), [화면 명세](../spec/design.md)를 따른다.

주변에 있는 사람을 BLE로 발견하고, 자기소개와 교류 의도를 바탕으로 별도 수락 없이 바로 대화를 시작하는 앱의 UI다. **행사 방·QR 입장·운영자 종료·요청/수락은 이 모델에 없다.** 이전 행사 MVP 구현은 [이력](../docs/history/event-mvp/)에 보존한다.

## 실행과 빌드

```sh
npm ci
npm run dev
npm run lint
npm test
npm run build
```

- `npm run dev`: 브라우저에 저장하는 데모. **BLE가 없으므로 실제 발견은 동작하지 않는다.** 예시 참가자는 답장하지 않는다.
- `npm run build`: 실제 HTTP API를 사용하는 `dist/`. 예시 참가자 데이터는 번들에 포함하지 않는다.
- `npm run build:demo`: 명시적인 데모 빌드 `dist-demo/`.
- 실제 서버에 연결하려면 `.env.example`을 `.env.local`로 복사하고 `VITE_USE_MOCK=0`을 사용한다. Vite가 `/api`를 `http://127.0.0.1:8000`으로 프록시한다.
- `VITE_USE_MOCK=1`은 모든 모드에서 데모를 강제하며, `0`은 모든 모드에서 실제 API를 강제한다.

화면은 `#nearby`, `#profile`, `#detail/{id}`, `#chat/{id}`, `#conversations`로 구분하며 새로고침·뒤로가기를 지원한다.

## 구현 범위

- 첫 실행·수정: 필수 입력, Unicode 코드 포인트 한도, 필드별 오류, 중복 저장 방지, 프로필 리비전 충돌 처리. 같은 설치로 복원.
- 주변 목록: 발견 ON/OFF와 실제 작동 상태를 나눠 표시, 검색, 유효한 후보 전체 유지, 추천 우선 정렬, 추천 지연·실패 안내, 수동 재시도.
- 상세: 자기소개·만나고 싶은 사람·조회자별 추천 이유(1~2문장). 오래된 리비전의 이유는 표시하지 않는다. 숫자 점수는 노출하지 않는다.
- 근접 이탈: 관측이 만료되면 현재 상태를 표시하고, 이미 있는 대화는 그대로 열 수 있다.
- 발견 ON/OFF: 끄면 새 발견과 **새 상대와의** 대화 시작만 멈춘다. 이미 시작한 대화는 이력 조회·송수신을 유지한다.
- 대화: 상대별 목록·이력, 이전 메시지 페이지, 초안 유지, 전송 실패 재시도, 요청 ID 재사용, 서버 ID 중복 제거, 순번 기반 누락 복원.
- 실시간: SSE `ready` 이후 조회, 재연결·화면 복귀 동기화, 활성 화면 15초 보완 조회. SSE가 붙지 않으면 5초 후 REST 보완 조회.
- 추천 근거 부족: 선택적 입력 보완만 유도하고 목록·채팅 이용을 막지 않는다(AI-D2).
- 접근성·모바일: 입력 라벨, 오류 알림, 키보드 포커스, 한글 조합 중 Enter 전송 방지, 긴 문장 줄바꿈, viewport·safe area, 줄어든 동작 설정.

## 네이티브 경계

[`src/lib/native.js`](src/lib/native.js)가 Capacitor `Discovery` 플러그인과의 계약이다. **BLE 광고·스캔·백그라운드 관측 보고·추천 알림은 Kotlin이 담당하고, JS는 타이머로 스캔하지 않는다.** 프론트는 사용자의 참여 의사를 내려보내고(`start`/`stop`) 실제 작동 상태를 되읽는다(`getStatus`, `statusChanged`).

지속 ON은 **의사**이고 권한·Bluetooth·OS 제한은 **실제 작동**이다. 둘을 화면에서 분리하며, 권한이 막혔다고 참여 설정을 대신 끄지 않는다. 플러그인이 없는 브라우저에서는 `supported: false`로 보고하고 화면에 그렇게 적는다.

## 데이터와 서버 연결

`api/client.js`는 설치 자격 쿠키, 프로필, 발견 설정, 관측 보고, 주변 목록, 추천, 대화 REST와 SSE 어댑터다. 공개 `user_id`나 BLE 임시 식별자를 인증으로 쓰지 않는다.

**엔드포인트 경로는 이 프론트의 제안이며 아직 확정이 아니다.** [API 계약](../docs/api-contract.md)이 "엔드포인트·제한 수치는 구현 시 공동 예시와 OpenAPI로 고정한다"고 정한 T00 대상이다. 필드명은 계약 문서를 따랐다.

`api/mock.js`는 같은 인터페이스의 브라우저 전용 데모이며 **라디오가 아니라 서버를 흉내 낸다.** `localStorage`의 `bside:demo:v3:*` 키를 쓰고, 발견이 켜져 있는 동안 예시 참가자를 관측된 것으로 취급한다. 끄면 관측을 갱신하지 않아 실제 근접 이탈처럼 목록에서 사라진다. 추천은 공통 주제와 교류 의도를 비교하는 단순 규칙이며 실제 AI가 아니다.

**`server/`의 제품 API는 아직 미구현이다.** 프론트 호출부 구현과 실제 서버 통합 완료는 구분한다.

## 구조

```text
src/
  api/                   실제 HTTP·데모 어댑터와 공통 JSDoc
  lib/contracts.js       입력 한도, 정렬, 추천 리비전, 메시지 병합
  lib/native.js          Capacitor/Kotlin 발견 플러그인 브리지와 작동 안내 문구
  discovery-controller.js 비동기 요청 소유권, 상태 reducer, 동기화·전송, 네이티브 연동
  state.jsx              React reducer·Context 연결과 브라우저 수명
  use-discovery.js       Context hook
  components/            공통 헤더·오류·로딩·참가자 카드·발견 패널
  screens/               첫 실행·주변 목록·상세·대화 목록·채팅
  index.css              모바일 중심 다크 테마
tests/                   Node 내장 테스트 러너로 계약·실패·응답 경합 검증
```

[검증 기록](VERIFICATION.md)에 실행 범위와 서버·실기기 미검증 항목을 기록한다. 테스트·빌드 성공만으로 실기기 통신 완료를 주장하지 않는다.
