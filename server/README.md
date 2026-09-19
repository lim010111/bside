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
방·상태·SSE·AI API 및 프론트 연결은 후속 작업입니다. 프론트의 목 데이터 설정은 유지합니다.

## Redis

서버 장애 대응과 수평 확장을 위해 Redis 저장 기반을 구성합니다.
`server/`에서 Docker Compose로 실행합니다.

```bash
docker compose up -d --wait
curl -i http://localhost:8000/ready
docker compose down  # 저장 데이터 유지
```

`REDIS_URL` 기본값은 `redis://127.0.0.1:6379/0`입니다.
`/ready`는 Redis 연결 성공 시 200, 실패 시 503을 반환하며 복구 후 다시 200을 반환합니다.
`/health`는 Redis 장애와 무관하게 정상 응답합니다.

상세 설정과 장애·영속화 검증 절차는 [Redis 운영 및 검증](docs/redis.md)을 참고하세요.
