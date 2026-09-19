# 개발·배포 경계

상태: 최신 main의 FastAPI·Docker·Redis·Nginx 기반을 채택한 실행 기준이다. 운영 서버에 접속하거나 배포하지 않았다. 제품 경로는 [API 계약](api-contract.md), 구현 상태는 [main 비교](reviews/baea751.md)를 따른다.

## 로컬 실행

- 화면: `web/`에서 `npm ci`, `npm run dev`. 빌드는 `npm run build`, 정적 검사는 `npm run lint`.
- 서버: `server/`에서 `.env.example`을 `.env`로 복사하고 `uv sync --locked`, `uv run fastapi dev --port 8000`.
- Docker가 있으면 `server/`에서 `docker compose up -d --build --wait`로 API·Redis를 함께 실행한다. 로컬 API는 `http://localhost:8000`이다.
- `/health`는 프로세스 생존, `/ready`는 Redis 준비 상태다. Compose가 떠도 `/ready`를 별도로 확인한다. 현재 제품 API는 없다.
- 실제 API를 붙일 때 Vite의 `/api` 프록시를 `127.0.0.1:8000`으로 연결한다. 클라이언트는 상대 경로 `/api/...`를 사용한다. 이 프록시와 세션 쿠키는 아직 구현 작업이다.

## 채택한 운영 구성

기존 main은 OCI 개인 서버의 Nginx·TLS와 `bside-api.sungblab.com`, 백엔드 `127.0.0.1:8100`, SSE 프록시 설정을 준비했다고 기록했다. [당시 기록](https://github.com/lim010111/kosscchthon/blob/baea7518c4820b249dfe3c90151302fc0833ce06/spec/MASTER.md#L240)은 재사용할 배포 근거이며 현재 가동 여부를 확인한 증거는 아니다.

선택한 연결은 **한 HTTPS 출처에서 정적 화면과 `/api`를 함께 제공하는 것**이다. 그 출처를 기존 도메인으로 정할 경우 Nginx가 `/`에서 `web/dist`를 제공하고 `/api/`를 FastAPI로 경로 변경 없이 전달하도록 맞춘다. 별도 프론트 도메인과 API 도메인을 직접 연결하는 구성을 기본값으로 쓰지 않는다. Caddy·새 도메인 구성을 추가하지 않는다.

배포 담당이 적용할 조건:

1. 실제 Nginx 설정·인증서·다른 서비스 사용 포트·현재 Compose 프로젝트와 volume 이름을 확인한다. 기존 팀원의 ‘완료’ 기록만으로 교체 명령을 실행하지 않는다.
2. 기존 Nginx 안에 맞춰 `API_PORT=8100`을 설정한다. Compose의 `8000`은 로컬 기본값이므로 배포 포트와 혼동하지 않는다. 컨테이너·volume은 다른 프로젝트와 구분한다. **이미 데이터가 있는 Compose 프로젝트 이름을 변경하면 기존 volume을 놓칠 수 있으므로 같은 이름과 volume을 유지한다.** 최초 새 설치라면 `-p bside`처럼 전용 이름을 사용한다.
3. 정적 화면과 `/api`가 같은 scheme·host·port를 사용하게 연결한다. SSE의 응답 버퍼링을 끄고 긴 연결을 허용한다. 실제 경로는 `/api/rooms/{room_id}/events`다.
4. 쿠키는 API 계약의 옵션과 요청 출처 검사를 적용한다. CORS 설정만으로 세션·권한이 생기지 않는다. 로컬 HTTP 쿠키의 개발용 예외는 운영 설정으로 전파하지 않는다.
5. 초기 API worker는 하나다. Redis는 AOF와 영속 volume을 사용하고 제품 데이터에 짧은 TTL을 두지 않는다. `down -v`를 일반 배포·재시작 절차로 쓰지 않는다.
6. Redis host `6379` 매핑은 로컬 개발 접근용이다. 기존 서버에서 점유 중이면 운영 설정에서 해당 매핑을 제거하고 컨테이너 내부 연결을 사용한다. 다른 프로젝트의 Redis를 중단하지 않는다.

화면·제품 API·세션을 연결한 뒤 [V01~V12](validation.md)로 실제 두 브라우저와 재시작·종료를 검증한다. health·빌드 성공만으로 배포 및 MVP 완료로 기록하지 않는다.
