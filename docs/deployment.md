# Android 앱과 서버 배포 경계

2026-09-20. **서버 API를 운영에 배포했다**(아래 [배포 현황](#배포-현황)). Android APK 배포는 아직이다. [Android 구성](android-design.md), [API](api-contract.md), [검증](validation.md)을 따른다. 이전 웹 같은 출처 배포안은 [이력](history/event-mvp/docs/deployment.md)에 보존한다.

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

백그라운드 알림은 네이티브 결과 수신 경로가 필요하다. FCM을 채택한다면 해당 설정·서버 자격·앱 등록을 별도 구성해야 하며 현재 설정된 것으로 소개하지 않는다. 배포 완료는 health 성공이 아니라 실제 APK→서버→다른 단말 메시지·추천 알림까지 검증한 범위로 기록한다.

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

```powershell
git archive --format=tar -o $env:TEMPside-server.tar HEAD server
ssh.exe myserver-1 "mkdir -p ~/apps/bside && rm -rf ~/apps/bside/server"
scp.exe $env:TEMPside-server.tar myserver-1:/tmp/
ssh.exe myserver-1 "cd ~/apps/bside && tar xf /tmp/bside-server.tar && rm /tmp/bside-server.tar && git -C . rev-parse --short HEAD > DEPLOYED_COMMIT"
ssh.exe myserver-1 "cd ~/apps/bside/server && sudo docker compose -p bside up -d --build --wait"
```

서버의 `server/.env`에는 `API_PORT=8100`과 운영 `CORS_ORIGINS`를 둔다. 이 파일은 서버에만
있고 저장소에 넣지 않는다.

### 운영 시 주의

- 이 호스트에는 다른 서비스(기복이네, golden-casino, Coolify, Uptime Kuma)가 함께 돈다.
  **Nginx를 끄거나 다른 컨테이너를 건드리지 않는다.**
- `docker compose -p bside down -v`는 `bside_redis-data`를 지운다. 재시작 절차로 쓰지 않는다.
- Nginx 설정 변경은 `sudo nginx -t` 통과 후에만 reload한다.

### 확인된 것

- `GET /health`, `GET /ready` 공개 HTTPS에서 200
- `https://localhost` 출처의 CORS preflight 200 (Capacitor WebView가 붙을 수 있다)
- 설치 등록 → `/me` → 프로필 저장 → 발견 ON → BLE 식별자 발급까지 공개 주소로 성공

### 아직 안 된 것

- **APK가 이 주소를 가리키게 빌드하기.** `VITE_API_BASE`와 `android/app/src/main/res/values/api.xml`의
  `api_base_url`을 `https://bside-api.sungblab.com`으로 맞춰 다시 빌드해야 한다.
  지금 설치된 APK는 `adb reverse` 기준의 개발 빌드다.
- 실기기 두 대가 이 운영 서버를 통해 주고받는 왕복
- 모니터링 연결(Uptime Kuma에 이 주소 등록), 로그 보존 정책
