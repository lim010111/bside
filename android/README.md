# Android 네이티브 계층 (T01)

Capacitor 셸 + Kotlin BLE 계층. [`web/src/lib/native.js`](../web/src/lib/native.js)의 `Discovery`
플러그인 계약을 구현한다.

**빌드는 통과했고 실기기 BLE 검증은 하지 않았다.** 무엇을 확인했고 무엇을 안 했는지는 아래
[검증](#검증) 절에 그대로 적었다.

## 빌드

```sh
cd web
npm ci
VITE_API_BASE=https://<서버 주소> npm run build
npx cap sync android

cd ../android
./gradlew :app:assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
```

`local.properties`에 `sdk.dir=`로 Android SDK 경로가 필요하다(git에 올리지 않는다).
JDK 21, compileSdk 36, Kotlin 2.0.21을 쓴다.

### 로컬 서버에 붙여서 돌리기

```sh
cd server && docker compose up -d --wait redis && uv run uvicorn app.main:app --port 8000
adb reverse tcp:8000 tcp:8000

cd web && VITE_API_BASE=http://localhost:8000 npm run build && npx cap sync android
cd ../android && ./gradlew :app:installDebug
```

디버그 빌드는 [`src/debug/res/values/api.xml`](app/src/debug/res/values/api.xml)이 네이티브
주소를 `http://localhost:8000`으로 덮어쓰므로 따로 고칠 것이 없다.

**10.0.2.2가 아니라 localhost를 쓴다.** WebView 페이지가 `https://localhost`라서
`http://10.0.2.2` 호출은 mixed content로 차단된다(실제로 막히는 것을 확인했다).
`http://localhost`는 secure origin 예외라 통과하고, `adb reverse`는 실기기 USB에서도 같은
방식으로 동작한다.

## API 주소를 두 군데 맞춰야 한다

WebView 출처가 `https://localhost`라서 상대 경로 `/api/v1`은 번들된 정적 파일로 간다.
**웹과 네이티브 양쪽 모두 절대 주소가 필요하고, 둘이 같아야 한다.**

| 어디 | 무엇이 쓰나 |
| --- | --- |
| `VITE_API_BASE` (빌드 시) | WebView의 호출 — 프로필·대화·메시지 |
| [`app/src/main/res/values/api.xml`](app/src/main/res/values/api.xml)의 `api_base_url` | 스캐너 자신의 호출 — 식별자 발급·관측 보고 |

`api_base_url`이 비어 있으면 플러그인은 스캔하지 않고 `supported: false`로 보고한다.
없는 서버에 대고 도는 것보다 낫다.

## 확정 1 — 설치 자격 증명을 WebView로 넘기는 방법

[`CredentialStore.kt`](app/src/main/java/app/bside/discovery/CredentialStore.kt)가
`EncryptedSharedPreferences`에 보관하고, `getCredential()`로 요청마다 빌려준다. JS는
클로저 메모리에만 들고 `localStorage`에 쓰지 않는다([`credentials.js`](../web/src/lib/credentials.js)가
네이티브가 있으면 로컬 저장을 건너뛴다).

대안이었던 "네이티브가 모든 WebView 요청에 Authorization 헤더를 주입"은 택하지 않았다.
어떤 호출이 인증되는지 코드에서 안 보이고, Capacitor의 요청 가로채기가 Android 버전마다
다르다.

자격 증명을 JS에 아예 넣지 않기로 바꾸려면 플러그인에 `fetch(path, body)`를 추가하고
[`api/client.js`](../web/src/api/client.js)의 전송 계층만 바꾸면 된다. **프론트의 다른 코드는
자격 증명이 어디 있는지에 의존하지 않는다.**

네이티브 스캐너도 이 저장소를 직접 읽는다. 앱이 백그라운드일 때 혼자 API를 호출해야 하기
때문이다.

## 확정 2 — 관측 결과를 WebView로 올리는 방법

네이티브가 스캔하고, 네이티브가 직접 `POST /api/v1/discovery/observations`를 호출하고,
서버 응답을 `observations` 이벤트로 JS에 밀어준다. `refreshObservations()`는 같은 일을
요청 시점에 한 번 한다.

JS는 이 엔드포인트를 직접 호출하지 않고 스캔 타이머도 돌리지 않는다.

이건 선택이 아니라 API가 강제한다. v0.1에는 `GET /discovery/nearby`가 없어서 **주변 목록을
아는 유일한 방법이 스캔을 보고한 당사자가 되는 것**이다.

## 식별자를 BLE로 싣는 방법

서버가 주는 식별자는 128비트를 22자 base64url로 쓴 값이다. 그 16바이트 원본을 BLE
manufacturer-specific data에 넣는다.

```
[2바이트 company id 0xFFFF][16바이트 식별자]
```

31바이트 광고 패킷에서 18바이트다. scan response도, GATT 연결도 필요 없다. **연결을 맺지
않는다** — 스캔 결과만으로 끝나는 것이 발견을 싸게 만든다.

`0xFFFF`는 SIG가 테스트용으로 열어둔 company id다. **실제 배포 전에 등록된 company id나
16비트 service UUID로 바꿔야 한다.** 둘 다 [`DiscoveryRadio.kt`](app/src/main/java/app/bside/discovery/DiscoveryRadio.kt)의
상수 교체로 끝난다.

회전 시점은 서버가 정한다. `refresh_after`가 지나면 재발급하고 광고를 다시 시작하며,
교체된 이전 값도 서버에서 최대 1분간 유효하므로 그 사이 들은 상대도 해석된다.

## 백그라운드

Android는 백그라운드 프로세스의 BLE 스캔을 멈추므로 sweep 루프가
[`DiscoveryService`](app/src/main/java/app/bside/discovery/DiscoveryService.kt)라는 foreground
service에서 돈다. 표시되는 알림은 "지금 스캔 중인가"에 대한 정직한 답이기도 하다 — 사용자가
보고 끌 수 있다.

주기는 15초로 시작한다. 측정값이 아니라 출발점이며, 계약대로 첫 실기기 실행에서 실제 값을
기록해야 한다.

## 의사와 실제 작동은 분리한다

사용자의 발견 참여 의사(`discovery_enabled`)는 서버에 있다. 플러그인은 라디오가 실제로
무엇을 하고 있는지 `getStatus()`로 보고할 뿐, 그 설정을 대신 끄지 않는다. 권한 거부는
보여줄 상태이지 사용자를 꺼버릴 이유가 아니다.

## 검증

에뮬레이터(API 36)에 실제로 설치해서 **APK가 실제 FastAPI 서버와 통신하는 것까지** 확인했다.

**확인한 것**

- `assembleDebug`·`assembleRelease` 둘 다 빌드 성공. 디버그 APK 5.2MB
- APK 권한에 `BLUETOOTH_SCAN`(neverForLocation), `BLUETOOTH_ADVERTISE`,
  `FOREGROUND_SERVICE_CONNECTED_DEVICE`가 들어감
- `DiscoveryService`가 `foregroundServiceType="connectedDevice"`로 매니페스트에 선언되고,
  발견을 켤 때 실제로 시작됨 (`Background started FGS: Allowed ... app.bside/.discovery.DiscoveryService`)
- 다섯 개 Kotlin 클래스가 APK dex에 들어간 것을 확인
- 앱 실행 → **설치 등록 `POST /api/v1/installations` 201**, `GET /me` 200
- 소개 저장 `POST /me/profile` 200, 발견 켜기 `POST /me/discovery` 200
- **네이티브 스캐너가 `POST /api/v1/discovery/identifiers` 200을 직접 호출**.
  WebView와 다른 소켓에서 나갔으므로 `ApiClient`가 `EncryptedSharedPreferences`의 자격
  증명으로 스스로 인증한 것이 맞다 (확정 1·2가 실제로 도는 증거)
- 플러그인 상태가 기기의 실제 값을 그대로 보고:
  `{"supported":true,"simulated":false,"running":true,"bluetooth":"on","permission":"granted","os":"restricted"}`
  화면에도 "배터리 절약 설정 때문에 백그라운드 발견이 제한될 수 있어요."로 나타남
- API 주소가 비어 있을 때는 부트 오류 화면("연결하지 못했어요")이 정상적으로 뜸

이 과정에서 **서버 CORS에 `https://localhost`를 추가해야 한다는 것**과
**`http://10.0.2.2`는 mixed content로 막힌다는 것**을 발견해 각각 고쳤다. 실제로 돌려보지
않으면 나오지 않는 문제였다.

**확인하지 않은 것 — 여기가 남은 일이다**

- **실제 BLE 광고·스캔.** 에뮬레이터에는 실제 BLE 라디오가 없다. 광고가 실제로 나가는지,
  상대 기기가 듣는지, 31바이트 패킷에 문제가 없는지는 실기기에서 봐야 한다.
- 안드로이드 두 대의 실제 발견 → 첫 메시지 왕복(T07)
- 백그라운드 sweep이 Doze·배터리 최적화에서 얼마나 버티는지. 주기 15초도 측정 전 값이다.
- 권한 거부·Bluetooth OFF 상태의 화면. 에뮬레이터는 권한을 자동 허용해서 그 경로를 못 봤다.
- 추천 알림. v0.1에 추천 데이터 자체가 없어 아직 붙일 것이 없다
- 릴리스 서명. `assembleRelease`는 통과하지만 서명 설정은 하지 않았다

## 개발 중 서버 연동만 따로 확인하기

플러그인 없이 프론트↔서버만 보려면 [`web/src/api/dev-radio.js`](../web/src/api/dev-radio.js)가
브라우저 탭 두 개를 두 기기처럼 쓴다. 실제 BLE가 아니고 `VITE_DEV_RADIO=1`일 때만 만들어지며
운영 번들에 들어가지 않는다.

```sh
cd server && docker compose up -d --wait redis && uv run fastapi dev app/main.py
cd web && VITE_USE_MOCK=0 VITE_DEV_RADIO=1 npm run dev
# 탭 두 개: http://localhost:5173/?device=a 와 ?device=b
```
