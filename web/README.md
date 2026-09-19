# Bside 프론트엔드

React 19 · Vite · JavaScript/JSX. 화면과 데이터 경계는 [개발 기준](../docs/development-contract.md), [API 계약](../docs/api-contract.md)을 따른다.

## 실행과 빌드

```sh
npm ci
npm run dev
npm run lint
npm test
npm run build
```

- `npm run dev`: 브라우저에 저장하는 데모. 예시 참가자는 답장하지 않는다. 사용자의 요청에 따라 화면에는 데모 배너나 구현 방식 안내를 표시하지 않는다.
- `npm run build`: 실제 HTTP API를 사용하는 `dist/`. 예시 참가자 데이터는 번들에 포함하지 않는다.
- `npm run build:demo`: 명시적인 데모 빌드 `dist-demo/`.
- 개발 중 실제 서버에 연결하려면 `.env.example`을 `.env.local`로 복사하고 `VITE_USE_MOCK=0`을 사용한다. Vite가 `/api`를 `http://127.0.0.1:8000`으로 프록시한다.
- `VITE_USE_MOCK=1`은 모든 모드에서 데모를 강제하며, `0`은 모든 모드에서 실제 API를 강제한다. 환경값 변경 후 개발 서버를 다시 시작한다.
- 배포는 화면과 `/api`를 같은 HTTPS 출처에서 제공한다. `/r/*` 경로도 `index.html`로 연결하는 정적 호스팅 fallback이 필요하다.

기본 방은 `KOSS26`. `?r=FEMEETUP`과 `/r/{room_id}` 링크를 지원한다. 화면은 `#people`, `#profile`, `#detail/{id}`, `#chat/{id}`, `#conversations`로 구분하며 새로고침·브라우저 뒤로가기를 지원한다.

## 구현 범위

- 입장·수정: 필수 입력, Unicode 코드 포인트 한도, 필드별 오류, 중복 저장 방지, 프로필 버전 충돌 처리.
- 목록: 검색, 전체 참가자 유지, 유효한 추천 우선 정렬, 추천 지연·실패 안내, 수동 추천 재시도.
- 상세: 자기소개·찾는 사람·조회자별 추천 이유. 오래된 프로필 버전의 이유는 표시하지 않는다.
- 참여 중단·재개: 동일 참가자와 대화 유지. 중단 중에는 기존 대화만 열람하고 새 전송은 비활성화한다.
- 대화: 상대별 목록·이력, 이전 메시지 페이지, 초안 유지, 전송 실패 재시도, 요청 ID 재사용, 서버 ID 중복 제거, 순번 기반 누락 복원.
- 실시간 연결: SSE `ready` 이후 조회, 재연결·화면 복귀 동기화, 활성 화면 15초 보완 조회. SSE 연결이 성립하지 않으면 5초 후 REST 보완 조회를 시작한다.
- 종료: `room.closed`·`ROOM_CLOSED` 수신 시 스트림/요청 종료와 개인 상태 제거. 늦은 응답은 무시한다.
- 접근성·모바일: 입력 라벨, 오류 알림, 키보드 포커스, 한글 조합 중 Enter 전송 방지, 긴 문장 줄바꿈, viewport·safe area 대응, 줄어든 동작 설정.

운영진 대시보드는 MVP 보류 범위다. `?view=dashboard`는 준비 중 안내만 제공하며 고정 숫자를 실시간 통계로 표시하지 않는다. 이 URL은 운영 권한이 아니다.

## 데이터와 서버 연결

`api/client.js`는 쿠키 세션, 참가자, 추천, 대화 REST와 SSE 어댑터다. ID를 권한으로 사용하지 않고 서버의 HttpOnly 쿠키를 함께 전송한다. 네트워크 오류, 취소, 시간 초과, API 오류 코드와 `Retry-After`를 처리한다.

`api/mock.js`는 같은 인터페이스의 브라우저 전용 데모다. `localStorage`의 `bside:demo:v2:*` 키에 예시 방·참가자·메시지를 저장한다. 기존 프로토타입 저장 키는 수정하지 않는다. 추천은 공통 주제와 교류 의도를 비교하는 단순 규칙이며 실제 AI가 아니다. 다른 기기와 공유되지 않으며 저장 권한이 없으면 오류를 표시한다.

**`server/`의 제품 API는 아직 미구현이다.** 프론트 HTTP 호출부 구현과 실제 서버 통합 완료는 구분한다. 실제 두 기기의 답장, 영속 쿠키·Redis 재시작 복원, 서버 권한·원자성, 실제 AI 품질, 종료 후 서버 정리는 백엔드·AI와 함께 검증해야 한다.

## 구조

```text
src/
  api/                 실제 HTTP·데모 어댑터와 공통 JSDoc
  lib/contracts.js     입력 한도, 정렬, 추천 버전, 메시지 병합
  room-controller.js   비동기 요청 소유권, 상태 reducer, 동기화·전송
  state.jsx            React reducer·Context 연결과 브라우저 수명
  use-room.js          Context hook
  components/          공통 헤더·오류·로딩·참가자 카드
  screens/             입장·목록·상세·대화 목록·채팅·종료
  index.css            모바일 중심 다크 테마
tests/                 Node 내장 테스트 러너로 계약·실패·응답 경합 검증
```

[검증 기록](VERIFICATION.md)에 실행 범위와 서버 통합의 미검증 항목을 기록한다. 테스트·빌드 성공만으로 실기기 통신 완료를 주장하지 않는다.
