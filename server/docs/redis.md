# Redis 운영 및 검증

서버 장애 대응과 수평 확장을 위해 상태를 Redis에 저장하는 기반을 구성합니다.

`server/`에서 실행합니다. Redis 이미지는 구현 시점의
[공식 이미지 목록](https://github.com/docker-library/official-images/blob/master/library/redis)에서
최신 안정 태그인 `8.10.1`로 고정했습니다.

```bash
docker compose up -d --wait redis
uv sync --locked
uv run fastapi dev --port 8000
```

`REDIS_URL` 기본값은 `redis://127.0.0.1:6379/0`입니다. 로컬 포트는 127.0.0.1에만
노출됩니다. 앱 lifespan이 비동기 클라이언트를 생성하고 종료 시 닫습니다.
연결·응답 타임아웃은 각각 2초이며 자동 재시도는 하지 않습니다.
후속 API는 `Depends(get_redis)` (`app.redis`)로 클라이언트를 재사용합니다.

- `/health`: Redis와 무관하게 `200 {"status":"ok"}`
- `/ready`: Redis PING 성공 시 `200 {"status":"ok"}`, 실패 시 `503 {"status":"unavailable"}`
- Redis가 없어도 앱은 시작합니다. Redis 복구 후 다음 준비 상태 요청에서 다시 PING합니다.

개발 서버를 켠 상태에서 장애·복구를 확인합니다.

```bash
curl -i http://localhost:8000/ready
docker compose stop redis
curl -i http://localhost:8000/ready   # 503
curl -i http://localhost:8000/health  # 200
docker compose up -d --wait redis
curl -i http://localhost:8000/ready   # 200
```

영속화·TTL 확인 (임시 검증 키만 사용):

```bash
docker compose exec -T redis redis-cli SET bside:verify:persistence ok EX 300
docker compose exec -T redis redis-cli SET bside:verify:ttl ok EX 2
sleep 3
docker compose up -d --force-recreate --wait redis
docker compose exec -T redis redis-cli GET bside:verify:persistence # ok
docker compose exec -T redis redis-cli EXISTS bside:verify:ttl      # 0
docker compose exec -T redis redis-cli DEL bside:verify:persistence bside:verify:ttl
docker compose down
```

`docker compose down`은 named volume을 유지합니다. `down -v`는 저장 데이터까지 삭제하므로
데이터 초기화가 필요할 때만 사용합니다. `appendonly yes`, `appendfsync everysec`로
AOF를 기록합니다. 장애 시 최근 약 1초의 쓰기가 유실될 수 있습니다.
[Redis 영속화 문서](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)

하트비트가 5분 중단된 상태의 TTL 만료와 행사 종료 시 방 삭제는 후속 도메인 기능의
요구사항이며 아직 구현하지 않았습니다. TTL은 디스크 기록의 즉시 완전 삭제를 보장하지 않습니다.

## 구현 시 검증 결과

- 첫 커밋: 잠금 설치, Redis 없는 개발 서버 실행, health·OpenAPI·문서·CORS 테스트 통과.
- 둘째 커밋: 잠금 설치 및 자동 테스트 4개 통과. 실제 Redis 8.10.1에서 준비 상태
  성공 → 중단 시 503 (health 200) → 재생성 후 200 복구를 확인했습니다.
- AOF 설정, named volume을 통한 임시 키 복구, TTL 만료를 확인하고 임시 키와 컨테이너를 정리했습니다.
- 테스트 의존성 내부의 httpx 및 AnyIO 사용에 대한 deprecation 경고 2개가 있습니다.
