# Bside 서버


Python 3.12와 [uv](https://docs.astral.sh/uv/)가 필요합니다.

```bash
cd server
cp .env.example .env
uv sync --locked
uv run fastapi dev --port 8000
```

- `GET http://localhost:8000/health` → `200 {"status":"ok"}`
- API 문서: `/docs`, `/redoc`, `/openapi.json`
- `CORS_ORIGINS`는 JSON 문자열 배열입니다. 기본값은 로컬 Vite의 localhost 및 127.0.0.1 Origin입니다.
- 검증: `uv run pytest`

진입점은 `app.main:app`이며 `create_app()`으로 앱을 생성합니다. 설정과 라우터는
[FastAPI 공식 구조 안내](https://fastapi.tiangolo.com/tutorial/bigger-applications/)에 따라 분리했습니다.
현재 HTTP 구현은 health/ready·Redis 연결·기본 OpenAPI까지입니다. 설치 인증·프로필·BLE 관측·바로 채팅·클라이언트 연결은 후속 작업입니다. **AI 추천은 `app/ai/`에 독립 모듈로 구현했고 HTTP 엔드포인트 연결은 아직 후속 작업입니다.** 모듈 인터페이스·설정·한계는 [AI 추천 모듈](docs/ai.md), 실모델 실행 결과는 [AI 추천 검증 기록](docs/ai-validation.md)을 참고하세요. [현재 API 계약](../docs/api-contract.md)과 [팀 작업 T00~T08](../docs/team-plan.md)을 따르며, 과거 상태 한 줄·5분 만료·행사 방·요청/수락 계약을 구현하지 않습니다. BLE 발견은 Android가 담당하고 서버는 관측·추천·채팅을 처리합니다. 프론트는 아직 mock입니다.

## Docker로 함께 실행

Docker Compose가 있으면 FastAPI와 Redis를 함께 실행할 수 있습니다.

```bash
cd server
docker compose up -d --build --wait
```

접속 주소는 `http://localhost:8000`입니다. 종료는 `docker compose down`입니다.
Compose의 API는 `redis://redis:6379/0`으로 연결하며, `CORS_ORIGINS`는 `.env`에서 변경할 수 있습니다.

## Redis

같은 앱 설치 복원·부재 중 메시지 보관을 구현할 Redis 저장 기반입니다. 초기 API worker는 하나이며 수평 확장·프로세스 간 SSE 알림은 아직 구현하지 않았습니다.
`server/`에서 Docker Compose로 실행합니다.

```bash
docker compose up -d --wait redis
curl -i http://localhost:8000/ready
docker compose down  # 저장 데이터 유지
```

`REDIS_URL` 기본값은 `redis://127.0.0.1:6379/0`입니다.
`/ready`는 Redis 연결 성공 시 200, 실패 시 503을 반환하며 복구 후 다시 200을 반환합니다.
`/health`는 Redis 장애와 무관하게 정상 응답합니다.

상세 설정과 장애·영속화 검증 절차는 [Redis 운영 및 검증](docs/redis.md)을 참고하세요.

Compose는 AOF `appendfsync always`와 영속 volume을 사용합니다. 사용자·채팅에는 5분 TTL이나 시연 종료 특별 삭제를 적용하지 않습니다. 실제 제품 저장과 변경한 AOF 설정의 장애 복원 검증은 아직 남아 있습니다.

기존 OCI/Nginx 재사용과 Android APK의 원격 API·인증 경계는 [배포 기준](../docs/deployment.md)을 참고하세요. 이번 통합에서 운영 서버에 접속하거나 배포하지 않았습니다.
