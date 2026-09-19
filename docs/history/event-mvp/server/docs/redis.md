> **이력 자료:** BLE 전환 전 문서와 전환 중 안내를 보존한 자료입니다. 본문의 현재·확정 표기는 현행 요구가 아닙니다. [최신 결정](../../../../product-direction.md)을 따릅니다.

# Redis 운영과 제품 저장 계약

> **2026-09-19 제품 방향 전환:** 본문은 이전 행사 MVP의 명세·계획 또는 구현 자료입니다. 새 제품 방향은 BLE 기반 주변 교류이며, 이번 구현 범위와 대체 계약은 인터뷰 중입니다. 아래의 ‘현재·확정·개발 기준’ 표기를 새 방향의 승인된 요구사항으로 사용하지 않습니다. 현재 결정과 문서 전환 상태는 [BLE 근접 교류 전환](../../../../product-direction.md)을 먼저 확인합니다.

Redis 클라이언트·설정·health/ready·Docker Compose·영속 volume은 구현되어 있다. **아래 참가자·메시지 모델과 원자적 처리는 아직 구현할 계약이다.** API의 필드·상태·응답은 [공통 계약](../../docs/api-contract.md)을 따른다. SQLite를 함께 도입하지 않는다.

## 실행·연결

`server/`에서 실행한다. 현재 이미지 태그는 `redis:8.10.1`로 고정되어 있다.

```bash
docker compose up -d --wait redis
uv sync --locked
uv run fastapi dev --port 8000
```

`REDIS_URL` 기본값은 `redis://127.0.0.1:6379/0`, Compose API 내부에서는 `redis://redis:6379/0`이다. lifespan이 비동기 클라이언트를 만들고 종료 시 닫는다. 연결·응답 타임아웃은 각각 2초이고 자동 재시도는 하지 않는다. API는 `Depends(get_redis)`로 연결을 재사용한다.

- `/health`: Redis와 무관하게 200. 프로세스 생존만 확인한다.
- `/ready`: Redis PING 성공 시 200, 실패 시 503. 복구 후 다시 확인한다.
- Redis가 없어도 앱은 시작한다. Redis 장애 때 제품 API가 저장 성공을 반환하면 안 된다.

## 보존·수명

Compose는 `appendonly yes`, **`appendfsync always`**와 기존 `redis-data` volume을 사용한다. main의 `everysec`는 최근 약 1초의 쓰기를 잃을 수 있어 이번 통합에서 변경했다. Redis는 always 정책에서 fsync 후 응답한다. API는 Redis 쓰기 성공 뒤 HTTP 성공을 반환하고 이후 SSE로 알린다. 단일 디스크의 고장·백업·복제를 보장하는 구성은 아니다. [공식 AOF 정책](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/#how-durable-is-the-append-only-file)

기존 volume과 Compose 프로젝트 이름을 유지한다. `docker compose down`은 volume을 유지하지만 `down -v`는 데이터를 지우므로 일반 재시작·배포에 사용하지 않는다. always의 실제 지연과 장애 복원은 T00·T06에서 확인한다. [배포 경계](../../docs/deployment.md)

열린 행사의 참가자·대화·메시지·중복 요청 기록에는 5분 TTL을 적용하지 않는다. SSE 단절과 앱 종료도 키를 삭제하지 않는다. `EXPIRE`는 키 자체를 삭제하므로 참여 여부 표현으로 사용하지 않는다. [EXPIRE 동작](https://redis.io/docs/latest/commands/expire/)

운영자 종료 시 방 상태부터 닫고 모든 개인별 접근을 거부한다. 종료 후 1시간 정리·1분 작업 주기·기동 시 누락 정리·공유 세션 처리와 종료 안내용 방 정보 보존은 API 계약을 따른다. Redis key 삭제는 AOF의 과거 바이트까지 즉시 완전히 제거한다는 뜻이 아니다. 화면·로그에 그보다 강한 삭제 약속을 하지 않는다.

## 저장 모델과 인덱스

아래는 저장 담당이 구현할 최소 책임이다. key 이름은 `bside:` prefix와 행사 ID로 구분하며 실제 자료구조·key 도표를 구현과 함께 기록한다.

| 자료 | 함께 유지할 인덱스·불변 조건 |
| --- | --- |
| 브라우저 세션 | 비밀의 해시만 저장. 같은 방·세션에서 참가자 한 명. 복원용 매핑과 열린 방 참조 유지 |
| 행사·참가자 | 방 상태·후보 버전, 참가자 ID·참여 상태·입력 버전. 중단은 삭제가 아님 |
| 대화 | 방과 정렬한 두 참가자 ID 조합으로 하나. 각 당사자의 대화 목록에서도 찾을 수 있어야 함 |
| 메시지 | 대화별 단조 증가 순번과 본문·발신자·생성 시각. 이력 양방향 페이지 조회 지원 |
| 중복 요청 | 방·발신자·`client_message_id` → 수신자·정규화한 본문·원래 저장 결과. 메시지와 같은 수명 |
| 추천 | 조회자·후보의 입력 버전과 후보 집합 버전. 오래된 결과가 최신을 덮지 못함 |
| 정리 대상 | 종료 시각으로 기한 도래 방을 찾는 인덱스. 방별 데이터·인덱스 모두 지우고 종료 안내용 정보는 유지 |

유일성은 Redis가 SQL 제약으로 제공하지 않는다. 조회 후 별도 생성하는 코드로 처리하지 않고 동일한 원자적 실행 안에서 확인·생성한다. 제품 데이터가 메모리 압력 때문에 임의로 사라지는 eviction 정책을 쓰지 않는다. 용량 부족·쓰기 실패는 성공 응답으로 바꾸지 않는다.

## 원자적 저장·중복 방지

메시지 저장은 짧은 Lua 실행 하나로 상태 확인과 변경을 묶는 방식을 기본으로 한다. 방 닫기·참여 중단·재개도 같은 상태를 원자적으로 변경한다. 모델 호출·긴 루프를 이 실행 안에 넣지 않는다. [Lua 실행 보장](https://redis.io/docs/latest/develop/programmability/eval-intro/)

순서는 API 계약과 동일하다.

1. 서버 세션 인증과 입력 형식을 확인한다. 원자적 작업 안에서는 필요한 key 타입·존재·방 상태·소속·인자를 쓰기 전에 확인한다.
2. 닫힌 방은 과거 메시지 재시도도 거부한다. 열린 방에 같은 요청 기록이 있으면 수신자·본문이 같을 때 기존 결과를 반환하고 다르면 충돌이다. 참여 중단 뒤에도 이 기존 결과 조회는 가능하다.
3. 새 메시지는 양쪽 모두 참여 중이어야 한다. 중단·종료가 먼저 완료됐으면 새로 저장하지 않는다.
4. 대화 유일성·메시지 순번·본문·당사자별 인덱스·중복 기록을 같은 원자적 작업에서 저장한다. Redis 성공 응답 후 HTTP 성공, 이후 알림 순서를 지킨다.
5. 타임아웃이면 저장 안 됐다고 단정하지 않는다. 프론트는 같은 요청 ID로 재시도하고 서버는 같은 결과를 돌려준다. 같은 본문을 새 요청 ID로 자동 재전송하지 않는다.

**원자적 실행은 실행 오류 시 자동 롤백을 뜻하지 않는다.** `MULTI/EXEC`와 Lua를 SQL 트랜잭션처럼 취급하지 않는다. 쓰기 전 타입·인자 검증과 오류 경로 검증이 필요하며, 부분 실패를 성공 메시지로 반환하지 않는다. 잘못된 key 타입·동시 중복·중단/종료 경합·응답 유실을 검증한다. [트랜잭션 오류](https://redis.io/docs/latest/develop/using-commands/transactions/), [Redis의 rollback 설명](https://redis.io/blog/you-dont-need-transaction-rollbacks-in-redis/)

초기 SSE 구독자는 단일 API worker 안에서 관리한다. 재연결·화면 복귀·보완 조회로 Redis 이력을 복원한다. 다중 worker로 바꾸면 프로세스 사이 알림 전달이 추가로 필요하다. Redis Pub/Sub도 유실 가능한 알림이므로 이력 저장을 대체하지 않는다. [Pub/Sub 전달 보장](https://redis.io/docs/latest/develop/pubsub/#delivery-semantics)

## 검증 범위

현재 자동 테스트 4개는 health·OpenAPI·CORS·모의 Redis 장애/복구·미접속 포트를 확인한다. 제품 저장·실제 Redis AOF 복원을 검증하는 테스트는 아직 없다.

main 작성자가 실제 Redis 8.10.1의 준비 상태·volume 재생성·TTL을 확인한 기록은 [이전 커밋](https://github.com/lim010111/kosscchthon/blob/baea7518c4820b249dfe3c90151302fc0833ce06/server/docs/redis.md#L56)에 있다. 이번 통합 검증은 이를 재현한 것이 아니며 변경한 always 설정도 아직 실제 Redis에서 실행하지 않았다.

다음 검증은 격리된 개발용 Redis와 가상 데이터로 수행한다.

- `/ready` 성공 → Redis 중단 시 503, `/health` 200 → 복구 후 `/ready` 200.
- 실제 적용된 `appendonly`·`appendfsync`와 volume 확인. 응답한 메시지 직후 Redis 프로세스를 강제 재시작해 이력·중복 기록 복원 확인.
- V06·V08: 재시작·응답 유실·동시 재시도·다른 본문 충돌, 참가자·대화 중복 생성 없음.
- V07·V12: 중단/재개·종료와 새 메시지의 경합, 종료 후 늦은 응답·추천 적용 차단.
- 정리 기한 전 보존·후 삭제, 다른 열린 방의 공유 세션 보존, 종료 안내용 방 정보 유지.
- AOF always에서 대표 입력·메시지 쓰기 지연을 측정. 미검증 참가 인원·지연을 성능 보장으로 발표하지 않음.
