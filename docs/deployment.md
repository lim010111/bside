# Android 앱과 서버 배포 경계

2026-09-20. 운영 서버에 접속하거나 배포하지 않았다. [Android 구성](android-design.md), [API](api-contract.md), [검증](validation.md)을 따른다. 이전 웹 같은 출처 배포안은 [이력](history/event-mvp/docs/deployment.md)에 보존한다.

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
