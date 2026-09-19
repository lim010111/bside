# Bside 서버

FastAPI · Redis. [API 계약 v0.1](../docs/api-contract.md)과 [OpenAPI](../docs/openapi.yaml)를 구현한다.
저장 계약은 [redis.md](docs/redis.md)를 따른다.

**실기기·BLE 없이 검증한 상태다.** 아래 테스트와 프론트 연동은 전부 로컬에서 돌린 것이며,
안드로이드 두 대의 실제 왕복은 [네이티브 계층](../android/README.md)이 구현된 뒤의 일이다.

## 실행

```sh
docker compose up -d --wait redis
uv sync --group dev
uv run fastapi dev app/main.py        # http://127.0.0.1:8000
uv run pytest
```

전체를 컨테이너로 올리려면 `docker compose up -d --wait`를 쓴다. `docker compose down -v`는
제품 데이터를 지우므로 일반 재시작 절차가 아니다.

테스트는 **실제 Redis의 15번 데이터베이스**를 쓰고 각 테스트 전후로 비운다. 0번은 건드리지
않는다. Redis가 없으면 테스트는 실패가 아니라 건너뛴다. 원자적 전송이 Lua 스크립트라서
가짜 Redis로는 정작 검증할 가치가 있는 부분을 못 본다.

## 엔드포인트

| 경로 | 하는 일 |
| --- | --- |
| `POST /api/v1/installations` | 설치 등록. 인증 없이 호출하는 유일한 API |
| `GET /api/v1/me` | 현재 설치 사용자. 프로필 작성 전 `profile`은 `null` |
| `POST /api/v1/me/profile` | 공개 프로필 **전체 교체**. 부분 수정 없음 |
| `POST /api/v1/me/discovery` | 발견 참여 ON/OFF |
| `POST /api/v1/discovery/identifiers` | BLE 임시 ID 발급·회전 |
| `POST /api/v1/discovery/observations` | 스캔 보고 → 관측된 사용자의 공개 프로필 |
| `GET /api/v1/conversations` | 내 대화 목록 |
| `POST /api/v1/messages` | 메시지 전송 |
| `GET /api/v1/conversations/{id}/messages` | 이력 (전진 전용) |

`/health`는 API 생존, `/ready`는 Redis 연결 상태다.

## 구현에서 신경 쓴 것

**인증.** 설치 자격 증명은 `sha256` 해시로만 저장한다. Redis 덤프가 그대로 유효한 자격
증명이 되지 않는다. 공개 `user_id`와 BLE 임시 ID는 인증 수단이 아니며, 요청 본문의 발신자
ID도 신뢰하지 않는다.

**첫 메시지의 원자성.** 관측 유효성·양쪽 발견 상태·양쪽 프로필 확인, 대화 생성, 순번 부여,
중복 방지 키 기록을 [`send_message.lua`](app/scripts/send_message.lua) 한 스크립트에서
처리한다. 파이썬으로 나눠 호출하면 그 사이에 다른 쓰기가 끼어들 수 있다. 스크립트 안에서는
외부 호출을 하지 않는다(AI·HTTP 없음).

**임시 ID 겹침.** 회전은 새 `ident:map` 키를 쓰고, 교체된 키는 자기 TTL로 만료된다. 계약의
"교체된 이전 ID도 최대 1분간 겹쳐 인정한다"가 별도 관리 없이 나온다.

**발견 OFF.** 광고를 멈추고 내가 모은 관측을 지운다. 대화와 이력은 건드리지 않는다.

**오류.** 모든 실패가 `{error:{code,message,details}}` 한 모양으로 나간다. FastAPI 기본 검증
오류도 `details.field`를 붙여 같은 모양으로 바꾼다. 잘못된 JSON은 400, 필드 오류는 422로
구분한다.

## 검증 범위

`uv run pytest` 33개가 계약 경계를 덮는다: 등록 멱등성과 10분 재생 창 만료, 공개 ID를
자격으로 쓸 수 없음, 알 수 없는 필드·깨진 JSON 거부, 코드 포인트 길이 한도(이모지 포함),
임시 ID의 선행 조건과 안정성, 관측이 잡음을 무시하되 배치를 실패시키지 않음, 발견 OFF인
상대는 관측되지 않음, 첫 메시지의 세 가지 거부 사유 구분, 기존 대화가 근접·발견을 다시
요구하지 않음, 멱등성 재생과 충돌, 양쪽이 동시에 첫 메시지를 보내도 대화는 하나,
전진 전용 페이지네이션, 비당사자 접근 거부, **재시작 후 이력·순번·중복 방지 키 복원**.

프론트와의 연동은 [web/VERIFICATION.md](../web/VERIFICATION.md)에 기록했다.

## 아직 검증하지 못한 것

- 실제 BLE와 안드로이드 두 대의 왕복
- Redis 재시작·AOF 복원의 실제 장애 시나리오 (V12). 앱 인스턴스 재시작만 확인했다
- 부하·동시성 규모. 원자성은 검증했지만 성능은 측정하지 않았다
- AI 추천. v0.1의 `recommendation.status`는 항상 `unavailable`이다
