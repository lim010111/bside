# Android 네이티브 계층 (T01)

**아직 빌드·실행하지 않았다.** 이 폴더는 프론트가 혼자 정할 수 없던 두 경로를 확정해 적은
계약과 그 구현 골격이다. Capacitor 프로젝트 생성·Gradle 설정·실기기 확인은 T01 담당의 일이다.

프론트 쪽 계약은 [`web/src/lib/native.js`](../web/src/lib/native.js)이고, 이 문서와 짝이다.

## 확정 1 — 설치 자격 증명을 WebView로 넘기는 방법

**네이티브가 `EncryptedSharedPreferences`에 보관하고, `getCredential()`로 요청마다 빌려준다.**
JS는 클로저 메모리에만 들고 있으며 `localStorage`에 쓰지 않는다([`credentials.js`](../web/src/lib/credentials.js)가
네이티브가 있으면 로컬 저장을 건너뛴다).

대안이었던 "네이티브가 모든 WebView 요청에 Authorization 헤더를 주입"은 택하지 않았다.
어떤 호출이 인증되는지 코드에서 안 보이고, Capacitor의 요청 가로채기가 Android 버전마다
다르게 동작한다.

나중에 자격 증명을 JS에 아예 넣지 않기로 바꾸려면 플러그인에 `fetch(path, body)`를 추가하고
[`api/client.js`](../web/src/api/client.js)의 전송 계층만 바꾸면 된다. **프론트의 다른 코드는
자격 증명이 어디 있는지에 의존하지 않는다.**

## 확정 2 — 관측 결과를 WebView로 올리는 방법

**네이티브가 스캔하고, 네이티브가 직접 `POST /api/v1/discovery/observations`를 호출하고,
서버 응답을 `observations` 이벤트로 JS에 밀어준다.** `refreshObservations()`는 같은 일을
요청 시점에 한 번 하는 것이다(당겨서 새로고침용).

JS는 운영에서 이 엔드포인트를 직접 호출하지 않고 스캔 타이머도 돌리지 않는다.

이건 선택이 아니라 API가 강제한다. v0.1에는 `GET /discovery/nearby`가 없어서, **주변 목록을
아는 유일한 방법은 스캔을 보고한 당사자가 되는 것**이다.

## 남은 결정 (구현자 몫)

- 백그라운드 동작을 위한 foreground service, 스캔 모드, duty cycle
- 22자 식별자를 advertising payload로 실을지 GATT로 읽을지
- 추천 알림. v0.1에는 추천 데이터 자체가 없어서 아직 붙일 것이 없다

## 구현 시 지켜야 하는 것

- 식별자는 `POST /api/v1/discovery/identifiers`가 발급한 값만 광고한다. 직접 만들지 않는다.
- `refresh_after`가 지나면 재발급하되, **교체된 이전 값도 최대 1분간 유효**하므로 즉시
  버리지 않는다.
- 관측 보고는 한 번에 최대 50개. 무효·만료·자기 자신 식별자는 서버가 알아서 무시하므로
  미리 걸러낼 필요가 없고, 배치 전체가 실패하지도 않는다.
- 권한 거부·Bluetooth OFF·배터리 제한은 `getStatus()`로 **있는 그대로 보고한다.** 사용자의
  발견 참여 의사(`discovery_enabled`, 서버에 저장)를 네이티브가 대신 끄지 않는다.

## 개발 중 서버 연동을 확인하는 방법

플러그인이 없어도 프론트와 서버의 연동은 확인할 수 있다. [`web/src/api/dev-radio.js`](../web/src/api/dev-radio.js)가
브라우저 탭 두 개를 두 기기처럼 쓰는 **개발용 가상 라디오**다. 실제 BLE가 아니고
`VITE_DEV_RADIO=1`일 때만 만들어지며 운영 번들에 들어가지 않는다. 화면에도 실제 발견이
아니라고 표시된다.

```sh
cd server && docker compose up -d --wait redis && uv run fastapi dev app/main.py
cd web && VITE_USE_MOCK=0 VITE_DEV_RADIO=1 npm run dev
# 탭 두 개: http://localhost:5173/?device=a 와 ?device=b
```

이 경로로 확인한 것은 **프론트↔서버**이지 BLE가 아니다. 실기기 두 대의 실제 왕복은 이
플러그인이 구현된 뒤에 별도로 검증해야 한다.
