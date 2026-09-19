# Android 네이티브 계층 (T01)

Capacitor 셸 + Kotlin BLE 계층. [`web/src/lib/native.js`](../web/src/lib/native.js)의 `Discovery`
플러그인 계약을 구현한다.

**실기기 한 대에서 광고·스캔·서버 연동까지 확인했고, 두 대 사이의 실제 발견은 아직이다.**
무엇을 확인했고 무엇을 안 했는지는 아래 [검증](#검증) 절에 그대로 적었다.

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

**실기기(SM-S937N, Android 16 / API 36)에서 확인했다.** 에뮬레이터로는 알 수 없던 것들이
여기서 드러났다.

**실기기에서 확인한 것**

- `POST /api/v1/installations` 201 → `/me` 200 → 소개 저장 200 → 발견 켜기 200
- **네이티브 스캐너가 `POST /api/v1/discovery/identifiers` 200을 직접 호출.** WebView와 다른
  소켓에서 나갔으므로 `EncryptedSharedPreferences`의 자격 증명으로 스스로 인증한 것이 맞다
- **BLE 광고가 실제로 전파에 나간다.** 블루투스 스택 덤프에
  `Ongoing advertising: app.bside`, `Connectable: false`(GATT 안 씀), interval 400,
  TX power -7로 잡힌다
- **스캔 필터가 스택에 등록된다.** `[app.bside(if=8)] BluetoothLeScanFilter[ ManufacturerId=ffff ]`
- foreground service가 `isForeground=true types=0x10(connectedDevice)`로 뜨고,
  알림이 `channel=discovery flags=ONGOING_EVENT|NO_CLEAR|FOREGROUND_SERVICE`로 실제 표시됨
- `BLUETOOTH_SCAN`·`BLUETOOTH_ADVERTISE`·`POST_NOTIFICATIONS` 모두 실제 권한 요청 후 granted
- 빌드: `assembleDebug`·`assembleRelease` 둘 다 성공

**실기기에서 발견해 고친 것**

- **알림 권한을 요청하지 않고 있었다.** Android 13+에서는 `POST_NOTIFICATIONS` 없이는
  foreground service 알림이 조용히 안 뜬다. 서비스는 도는데 "지금 스캔 중"이라는 표시가
  사용자에게 안 보이는 상태였다. 블루투스 권한 다음에 한 번만 묻도록 추가했고, 거부해도
  발견은 계속된다. 상태에 `notifications`를 실어 화면에도 알린다.
- 라디오의 `lastError`가 화면에 전혀 노출되지 않고 있었다. 광고가 실패해도 사용자는 아무것도
  못 본다. `nativeBlocker`가 이제 그대로 보여준다.

**확인하지 않은 것 — 여기가 남은 일이다**

- **두 대 사이의 실제 발견.** 한 대만 연결해서 테스트했다. 광고가 나가고 스캔 필터가 걸린
  것까지는 확인했지만, 상대 기기의 광고를 실제로 잡아 `observed_users`가 채워지는지는
  두 번째 기기가 있어야 안다. 여기서 31바이트 패킷 문제나 필터 오작동이 드러날 수 있다.
- 두 대의 첫 메시지 왕복(T07)
- Bluetooth OFF·권한 거부 상태의 화면. 코드 경로는 있으나 실제로 그 상태를 만들어보지 않았다
- 백그라운드 sweep이 Doze·배터리 최적화에서 버티는 정도. 주기 15초도 측정 전 값이다.
  실기기에서 `os: restricted`가 실제로 보고됐으므로 배터리 최적화 제외가 필요하다
- 추천 알림. v0.1에 추천 데이터 자체가 없어 아직 붙일 것이 없다
- 릴리스 서명

## 개발 중 서버 연동만 따로 확인하기

플러그인 없이 프론트↔서버만 보려면 [`web/src/api/dev-radio.js`](../web/src/api/dev-radio.js)가
브라우저 탭 두 개를 두 기기처럼 쓴다. 실제 BLE가 아니고 `VITE_DEV_RADIO=1`일 때만 만들어지며
운영 번들에 들어가지 않는다.

```sh
cd server && docker compose up -d --wait redis && uv run fastapi dev app/main.py
cd web && VITE_USE_MOCK=0 VITE_DEV_RADIO=1 npm run dev
# 탭 두 개: http://localhost:5173/?device=a 와 ?device=b
```
