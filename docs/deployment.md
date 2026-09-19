# Android 앱과 서버 배포 경계

2026-09-20. **서버 API를 운영에 배포했고, 운영 주소로 빌드한 APK를 실기기 두 대에서 검증했다**(아래 [배포 현황](#배포-현황)). 참여자 대상 APK 배포는 아직이다. [Android 구성](android-design.md), [API](api-contract.md), [검증](validation.md)을 따른다. 이전 웹 같은 출처 배포안은 [이력](history/event-mvp/docs/deployment.md)에 보존한다.

## 기존 로컬 자산

- UI: `web/`에서 `npm ci`, `npm run dev`, `npm run build`, `npm run lint`.
- 서버: `server/`에서 `.env.example`을 `.env`로 복사하고 `uv sync --locked`, `uv run fastapi dev --port 8000`.
- Compose: `server/`에서 `docker compose up -d --build --wait`. `/health`와 `/ready`를 구분한다.

현재 UI에는 행사 기반 HTTP/SSE 클라이언트와 브라우저 데모가 있다. 개발 실행은 데모, 일반 빌드는 HTTP 연결을 기본으로 하지만 서버 제품 API와 네이티브 계층은 미구현이다. 개발 웹 서버 실행만으로 Android BLE를 검증할 수 없다.

## Android 패키징

React 빌드 자산을 Capacitor Android 프로젝트에 포함하고 Kotlin BLE 계층을 연결한다. 실제 단말 개발 설치로 우선 검증하고 참여자 배포가 필요하면 APK·설치 안내를 준비한다. 앱스토어 출시는 자동 포함하지 않는다. SDK·최소 OS·빌드 버전은 구현 시 호환성과 실제 기기에 맞춰 고정한다.

APK 안의 UI와 원격 API는 같은 출처라는 전제를 두지 않는다. HTTPS API 주소, WebView origin/CORS 또는 네이티브 HTTP 경계, 설치 인증 자격 전달을 명시한다. 실제 단말의 localhost는 개발 PC를 가리키지 않는다. 운영 인증 자격·LLM 비밀키를 APK나 Git에 넣지 않는다.

## 서버 운영

기존 OCI/Nginx·TLS·API 포트 구성은 재사용 후보이며 가동 상태를 확인한 증거가 아니다. 실제 인증서·포트·프로젝트·volume을 확인한 뒤 변경한다. 기존 같은 출처 `/api/rooms/...`와 행사 쿠키 계약은 폐기한다. 원격 API와 Android 인증 경계에 맞춰 적용한다.

FastAPI·Redis AOF·영속 volume을 사용한다. 초기 단일 worker는 기존 기반의 개발 기본값으로 유지하며 확장·운영 SLA를 주장하지 않는다. `docker compose down -v`를 재시작 절차로 사용하지 않는다. 일반·시연 데이터 모두 같은 보관 정책이며 시연 종료 자동 정리 명령을 배포에 넣지 않는다.

백그라운드 알림은 FCM으로 구현했다(`server/app/push.py`, `android/.../PushService.kt`). 설정·서버 자격·앱 등록은 아래 [Firebase](#firebase)에 적는다. 배포 완료는 health 성공이 아니라 실제 APK→서버→다른 단말 메시지·추천 알림까지 검증한 범위로 기록한다.

## 배포 현황

2026-09-20에 `bside-api.sungblab.com`으로 서버 API를 올렸다.

| 항목 | 값 |
| --- | --- |
| 공개 주소 | `https://bside-api.sungblab.com` |
| 호스트 | OCI Ubuntu ARM64 (기존 개인 서버, SSH 별칭 `myserver-1`) |
| 경로 | `~/apps/bside/server`, 배포 커밋은 `~/apps/bside/DEPLOYED_COMMIT` |
| Compose 프로젝트 | `bside` (volume `bside_redis-data`) |
| 내부 포트 | `127.0.0.1:8100` → 컨테이너 8000 |
| TLS | Certbot 인증서, Nginx `sites-enabled/bside-api.sungblab.com` |

Nginx 설정과 인증서는 이전에 준비돼 있었고 오리진만 비어 502를 반환하던 상태였다. 이번에
컨테이너를 올려 채웠다. **Nginx 설정 파일은 건드리지 않았다.**

### 배포 절차

저장소가 private이라 서버에서 clone하지 않는다. 커밋된 트리에서 `server/`만 보낸다.

**설정의 원본은 `~/apps/bside/server.env`다.** 배포가 `server/`를 통째로 지우므로 `server/.env`를
원본으로 두면 배포할 때마다 사라진다. 한 단계 위에 두고, 풀어낸 뒤 복사해 넣는다.

```powershell
$commit = git rev-parse --short origin/main
git archive --format=tar -o $env:TEMP\bside-server.tar origin/main server
scp.exe $env:TEMP\bside-server.tar myserver-1:/tmp/
ssh.exe myserver-1 "rm -rf ~/apps/bside/server && cd ~/apps/bside && tar xf /tmp/bside-server.tar && rm /tmp/bside-server.tar && cp ~/apps/bside/server.env ~/apps/bside/server/.env && echo $commit > DEPLOYED_COMMIT"
ssh.exe myserver-1 "cd ~/apps/bside/server && sudo docker compose -p bside up -d --build --wait"
```

`server.env`에는 `API_PORT=8100`, 운영 `CORS_ORIGINS`, **`CREDENTIAL_REPLAY_SECRET`**,
AI 추천을 켤 때 필요한 `AI_API_KEY`·`AI_BASE_URL`·`AI_MODEL`, 푸시를 켤 때 필요한
`FCM_CREDENTIALS_HOST_FILE`과 `FCM_CREDENTIALS_FILE`을 둔다. 이 파일은 서버에만 있고
저장소에 넣지 않는다. `.dockerignore`가 `.env`를 이미지에서 제외하므로 이 값들은 compose
환경 변수로만 들어간다.

**`CREDENTIAL_REPLAY_SECRET`만 성격이 다르다.** 나머지는 없어도 기능만 꺼진 채 서버가
뜨지만, 이 값은 기본값이 없고 compose가 `:?`로 하드 실패시킨다. 10분 재전송 창에 보관하는
자격 증명을 평문으로 두지 않기 위한 키라서, 배포된 기본값을 두는 편이 없느니만 못하기
때문이다. 값을 바꾸면 그 순간 진행 중이던 재전송 창만 만료로 보이고, 이미 발급된 자격
증명과 로그인 상태에는 영향이 없다.

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

AI·푸시 값은 비어 있어도 서버가 정상 기동하며, 각각 추천을 `unavailable`로 보고하고
푸시를 보내지 않을 뿐이다.

```bash
ssh.exe myserver-1 "cd ~/apps/bside/server && sudo docker compose -p bside exec -T api printenv AI_MODEL"
```

### 운영 시 주의

- 이 호스트에는 다른 서비스(기복이네, golden-casino, Coolify, Uptime Kuma)가 함께 돈다.
  **Nginx를 끄거나 다른 컨테이너를 건드리지 않는다.**
- `docker compose -p bside down -v`는 `bside_redis-data`를 지운다. 재시작 절차로 쓰지 않는다.
- Nginx 설정 변경은 `sudo nginx -t` 통과 후에만 reload한다.

### 확인된 것

- `GET /health`, `GET /ready` 공개 HTTPS에서 200
- `https://localhost` 출처의 CORS preflight 200 (Capacitor WebView가 붙을 수 있다)
- 설치 등록 → `/me` → 프로필 저장 → 발견 ON → BLE 식별자 발급까지 공개 주소로 성공
- 운영 주소로 빌드한 APK(`-Pbside.apiBaseUrl=https://bside-api.sungblab.com`)를 올린
  실기기 두 대가 `adb reverse` 없이 서로를 BLE로 발견하고 메시지를 주고받음
- **AI 추천이 운영에서 동작.** 실기기 두 대에서 상대가 처음 보일 때 `pending`으로 왔다가
  다음 폴링에 `ready`가 되고, 상세 화면에 두 프로필에 근거한 이유가 표시됐다. 평가는
  방향별이라 양쪽 모두 상대에 대한 추천을 받았다. 응답에 점수·근거 인용·내부 버전은 없었다.
- 포그라운드 서비스 알림("주변 발견이 켜져 있어요")이 Android 16 실기기(Galaxy S25 계열) 알림 그늘에 실제로 뜬다.
  `POST_NOTIFICATIONS`를 요청하도록 고친 뒤의 상태다.
- **푸시 알림이 운영에서 동작.** 앱을 백그라운드에 둔 단말에 메시지를 보내 `messages`
  채널 알림이 뜨는 것을, 그리고 추천이 완료될 때 `nearby` 채널 알림이 뜨는 것을 확인했다.
  메시지 알림은 보낸 사람 닉네임과 본문을, 추천 알림은 닉네임만 담고 이유는 담지 않는다.
- **원자화된 등록·식별자 발급이 운영에서 동작.** 같은 `installation_request_id` 재전송이
  같은 자격 증명을 돌려주고(Fernet 복호화 경로), UUID가 아닌 중복 방지 키와 `android`가
  아닌 platform은 422, 회전 창 전의 재발급은 같은 식별자, 발견 OFF에서는 409
  `DISCOVERY_DISABLED`, 가짜 자격 증명은 401. 이미 설치된 단말은 로그아웃되지 않았다.

### Firebase

| 항목 | 값 |
| --- | --- |
| 프로젝트 | `bside-5a002` (Spark 무료 플랜) |
| Android 앱 | `app.bside` |
| 서비스 계정 | `firebase-adminsdk-fbsvc@bside-5a002.iam.gserviceaccount.com` |
| 키 위치 | 호스트 `~/apps/bside/fcm.json`, 컨테이너 `/run/secrets/fcm.json` |

Gemini in Firebase와 Google Analytics는 FCM에 필요 없고 각각 별도 데이터 조건이 붙어서 껐다.

**키 파일의 소유자는 컨테이너 UID여야 한다.** 이미지가 `USER 10001`로 돌기 때문에, 호스트
사용자 소유의 `0600` 파일은 컨테이너가 열지 못하고 `Permission denied`로 푸시가 조용히
꺼진다. 다른 서비스가 같이 도는 호스트라 `644`로 여는 대신 소유권을 넘긴다.

```bash
ssh.exe myserver-1 "sudo chown 10001:10001 ~/apps/bside/fcm.json && sudo chmod 400 ~/apps/bside/fcm.json"
```

적용 여부는 토큰을 하나 등록해 보고 응답의 `push_enabled`로 확인한다. 로그의 부재로
판단하지 않는다 — 껐다 켜기 전의 경고가 그대로 남아 있어 오해하기 쉽다.

### APK를 운영 주소로 빌드하기

`api_base_url`은 체크인된 파일이 아니라 빌드 시점 Gradle 속성이고, WebView 쪽 주소와
같아야 한다. 둘 중 하나만 바꾸면 반쪽만 운영 서버를 본다.

```sh
cd web && VITE_API_BASE=https://bside-api.sungblab.com npm run build && npx cap sync android
cd ../android && ./gradlew :app:assembleDebug -Pbside.apiBaseUrl=https://bside-api.sungblab.com
```

들어간 주소는 APK에서 직접 확인할 수 있다. 빌드 명령을 믿지 않고 결과물을 본다.

```sh
aapt2 dump resources app/build/outputs/apk/debug/app-debug.apk | grep -A 1 api_base_url
```

### 아직 안 된 것

- **릴리스 서명.** 지금 설치한 APK는 디버그 키로 서명돼 있다. 사이드로딩은 되지만 배포용이
  아니다.
- **`bside_redis-data` 백업이 없다.** 이 호스트의 `database-backup.timer`는 기복이네
  PostgreSQL만 받는다(`gibokine/deploy/backup-databases.sh`에 bside도 redis도 없다).
  대화와 메시지가 이 volume에만 있다.
- 푸시를 끄는 사용자 설정이 없다. 지금은 앱을 지우면 FCM이 토큰을 죽었다고 답하고 서버가
  지우는 것이 유일한 해지 경로다.
- 부하·동시성 규모를 측정하지 않았다. worker는 1개 그대로다.
- 모니터링 연결(Uptime Kuma에 `https://bside-api.sungblab.com/health` 등록), 로그 보존 정책
