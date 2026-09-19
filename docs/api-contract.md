# API와 데이터 계약 v0.1

상태: **개발 인계용 명세. 기본 FastAPI·OpenAPI와 health/ready는 구현됐으며, 이 문서의 제품 API는 아직 미구현이다.** 제품 동작은 [MVP 개발 기준](development-contract.md)을 따른다. 아래 경로·필드·한도·세션·정리 주기는 합의한 동작을 구현하기 위해 정한 기술 기본값이며, 사용자에게 추가 기능 요구로 돌리지 않는다. 변경하면 프론트·서버·AI의 예시와 이 문서를 함께 갱신한다.

## 공통 형식과 입력

- JSON 키는 `snake_case`, 시간은 서버가 기록한 UTC ISO 8601 문자열을 쓴다. 화면에서 한국 시간으로 표시한다.
- ID는 의미를 추정하지 않는 불투명 문자열이다. 아래 `p_a` 등은 설명용 예시다. ID만으로 권한을 부여하지 않는다.
- 문자열은 앞뒤 공백을 제거한 뒤 Unicode 코드 포인트 수로 검증한다. 프론트는 `Array.from(value).length`, Python은 `len(value)`를 기준으로 맞춘다. 줄바꿈은 본문 안에 유지한다.
- 아래 한도는 UI·서버 공통 상수이며 BLE 전송 한도에서 도출한 값이 아니다. HTML로 렌더링하지 않는다.

| 필드 | 기본 한도 | 비고 |
| --- | --- | --- |
| `nickname` | 1~20자 | 중복 허용. 동일인 판단은 닉네임 대신 참가자 ID 사용 |
| `self_description` | 1~500자 | 필수, 자유 입력 |
| `connection_intent` | 1~500자 | 필수, 자유 입력 |
| 메시지 `text` | 1~2,000자 | 필수, 텍스트만 |
| `client_message_id` | 1~64자 | 프론트가 매 새 메시지마다 생성. 같은 메시지 재시도에는 재사용 |
| 추천 `reason` | 1~300자 또는 `null` | `ready`이면 근거 있는 설명 필수, 다른 상태는 `null` |
| 메시지 조회 `limit` | 기본 50, 최대 100 | 잘못된 범위는 `INVALID_INPUT` |

## 세션과 권한

1. 화면은 입장 요청 전에 `POST /api/session`으로 브라우저 세션을 확보한다. 유효한 쿠키가 있으면 같은 세션을 유지한다. 응답에는 세션 비밀을 넣지 않는다.
2. 서버가 임의의 32바이트 이상 비밀값을 생성하고 해시만 DB에 저장한다. 배포 쿠키는 `HttpOnly; Secure; SameSite=Lax; Path=/api`로 발급한다. 브라우저 종료 후에도 남는 영속 쿠키를 쓰며 기본 `Max-Age`는 34,560,000초로 하고 세션 재확인 때 갱신한다. 이 값은 행사 이용 기간이 아니다. 서비스 접근은 항상 방 상태로 제한한다.
3. 한 브라우저 세션과 행사 방의 조합은 하나의 참가자다. 같은 입장 요청을 반복해도 참가자를 추가하지 않는다. 기존 참가자가 중단 상태라면 입장 재요청으로 자동 재개하지 않는다.
4. REST와 SSE는 같은 HTTPS 출처와 쿠키를 사용한다. 브라우저의 변경 요청은 `Origin`을 확인하고 외부 출처를 허용하지 않는다. 사용자용 API는 공개 참가자 ID나 입력의 `sender_id`를 권한으로 신뢰하지 않는다.
5. 운영자 자격은 참가자 세션과 별개다. 방 준비·종료는 서버 운영 명령 또는 운영자 전용 API로 수행하고, 운영 비밀을 프론트 번들이나 QR에 넣지 않는다.

쿠키 옵션의 구현 수단은 [FastAPI 응답 쿠키](https://fastapi.tiangolo.com/advanced/response-cookies/), [Starlette `set_cookie`](https://starlette.dev/responses/#set-cookie)를 따른다. 위 세션 구조와 기간은 이 MVP의 설계 선택이다. 브라우저 저장 정보가 사라진 경우의 계정 복구나 다른 기기 동기화는 현재 범위가 아니다.

| 요청 주체·상태 | 공개 방 안내 | 같은 방 목록·상세·추천 | 본인 정보 수정 | 본인 기존 대화 | 새 메시지 | 중단·재개 |
| --- | --- | --- | --- | --- | --- | --- |
| 아직 정보를 입력하지 않음 | 허용 | 거부 | 입장 입력만 | 거부 | 거부 | 거부 |
| 참여 중 | 허용 | 허용 | 허용 | 허용 | 양쪽이 참여 중이면 허용 | 허용 |
| 참여 중단 | 허용 | 허용 | 허용, 자동 재개 안 함 | 허용 | 거부 | 허용 |
| 행사 종료 | 종료 안내만 | 거부 | 거부 | 거부 | 거부 | 거부 |

중단한 본인의 탐색은 허용하는 개발 기본값이다. 중단한 상대는 목록·추천 후보에서 빠지지만 같은 방 참가자가 상세 URL이나 기존 대화에서 확인할 수 있다. 상세에는 `participation_status: stopped`를 보여주고 전송을 막는다. 이것은 프로필 비공개·삭제 기능이 아니다.

## 저장 모델과 수명

아래 모델은 논리적 계약이며 저장소는 Redis다. 이 문서의 ‘트랜잭션’은 관련 상태 확인과 갱신 사이에 다른 요청이 끼어들지 않는 원자적 작업을 뜻한다. SQL 테이블·자동 롤백을 전제하지 않는다. Redis key·인덱스·원자적 처리와 내구성 조건은 [서버 저장 계약](../server/docs/redis.md)을 따른다.

| 모델 | 주요 필드·제약 |
| --- | --- |
| Room | `id`, `name`, `status: open/closed`, `candidate_version`, `closed_at`, `purged_at`. 예정 종료 시각 없음 |
| BrowserSession | `id`, `secret_hash`, 생성·최근 확인 시각. 참가 권한 자체와 구분 |
| Participant | `id`, `room_id`, `session_id`, `nickname`, 두 원문, `participation_status: active/stopped`, `profile_version`, `joined_at`. `(room_id, session_id)` 유일 |
| Conversation | `id`, `room_id`, 정렬한 두 참가자 ID, `last_seq`. 방과 두 참가자 조합 유일 |
| Message | `id`, `conversation_id`, `seq`, `sender_id`, `client_message_id`, `text`, `created_at`. 대화별 `seq`와 발신자·방별 요청 ID 유일 |
| Recommendation | 조회자·후보 ID, 양쪽 `profile_version`, `candidate_version`, 상태·추천 순서·이유·생성 시각. 내부 점수는 AI 담당 선택 |

앱을 닫거나 SSE가 끊겨도 참가 상태를 바꾸지 않는다. `stop`과 `resume`만 참여 상태를 바꾼다. 닉네임 수정은 이번 API에서 다루지 않고 두 자유 입력만 수정한다.

운영자가 종료하면 같은 트랜잭션에서 `status=closed`, `closed_at`을 기록한다. 이후 개인별 조회·송수신·수정·재개는 즉시 거부한다. 종료된 방을 재개하지 않으며 다른 행사는 새 방으로 준비한다.

**정리 기본값:** 종료 1시간 후 해당 방의 참가자 원문·대화·메시지·추천 캐시를 삭제한다. 작업은 1분 주기로 돌리고 서버 기동 때 누락된 정리도 실행한다. 정상 실행 중에는 대상 시각 다음 주기에 정리되고, 서버가 중단돼 있으면 재기동 후 처리한다. 더 이상 참가 이력이 없는 세션도 정리하며 다른 열린 방을 사용하는 세션은 유지한다. 등록으로 이어지지 않은 세션은 마지막 사용 후 24시간에 정리한다.

닫힌 방의 ID·이름·상태·종료/정리 시각은 종료 안내를 위해 남긴다. 로그와 평가 기록에는 실제 참가자의 원문·채팅·쿠키·모델 키를 남기지 않고 시연용 가상 입력을 사용한다. 이 삭제 계약은 서비스 DB·앱 캐시 대상이며 외부 모델 사업자의 보관 정책을 대신 설명하지 않는다. AI 담당은 사용할 제공자의 전송·보관 조건을 실제 모델 선택 때 확인한다.

## 경로와 응답

별도 표기가 없으면 `/api/rooms/{room_id}` 뒤의 경로다. 아래 성공 응답의 필드는 최소 공통 계약이다.

| 메서드·경로 | 요청 | 성공 응답 |
| --- | --- | --- |
| `POST /api/session` | 없음 | 200, `{ "ready": true }`와 쿠키 |
| `GET /api/rooms/{room_id}` | 없음 | 200, `{ "room": { "id", "name", "status", "closed_at" } }` |
| `POST /participants` | 닉네임·두 원문 | 신규 201 / 기존 200, `{ "participant": Self }`. 기존 참가자는 입력을 덮어쓰지 않음 |
| `GET /me` | 없음 | 200, `{ "participant": Self }` |
| `PATCH /me` | `{ "self_description", "connection_intent", "expected_profile_version" }` | 200, 갱신한 Self. 두 원문을 함께 전달 |
| `POST /me/stop` | 없음 | 200, Self. 이미 중단이면 같은 상태 반환 |
| `POST /me/resume` | 없음 | 200, Self. 이미 참여 중이면 같은 상태 반환 |
| `GET /participants` | 없음 | 200, `{ "candidate_version", "recommendation_state", "items": [Banner] }` |
| `GET /participants/{id}` | 없음 | 200, `{ "participant": Detail, "recommendation": Reason }` |
| `GET /recommendations` | 없음 | 200, `{ "candidate_version", "state", "ordered_evaluated_ids": [] }` |
| `POST /recommendations/refresh` | 없음 | 202, `{ "candidate_version", "state" }`. 같은 버전 작업 중복 생성 안 함 |
| `GET /conversations` | 없음 | 200, `{ "items": [{ "id", "peer": { "id", "nickname", "participation_status" }, "last_seq", "last_message" }] }` |
| `POST /messages` | 수신자·요청 ID·텍스트 | 신규 201 / 같은 요청 재시도 200, `{ "message": Message, "replayed": false/true }` |
| `GET /conversations/{id}/messages` | `after_seq`, `before_seq`, `limit` | 200, 아래 이력 형식 |
| `GET /events` | 없음 | 200, 본인 권한으로 제한한 SSE |
| `POST /api/admin/rooms` | 운영 권한, `{ "name" }` | 201, 공개 방 안내와 `/r/{room_id}` 참여 경로 |
| `POST /api/admin/rooms/{id}/close` | 운영 권한 | 200, 종료된 공개 방 안내. 반복 종료는 같은 결과 |

운영용 두 API는 전용 화면 없이 보호된 운영 도구에서 사용할 수 있다. 공개 링크를 QR로 표현할 뿐 QR 생성·스캔 자체를 BLE 발견으로 설명하지 않는다.

`Self`는 `id`, `room_id`, `nickname`, `self_description`, `connection_intent`, `participation_status`, `profile_version`, `joined_at`이다. `Banner`는 `id`, `nickname`, `self_description`, `profile_version`, `joined_at`, `evaluation_state`만 포함한다. `Detail`은 같은 방 참가자의 Self 필드이며 세션 정보는 포함하지 않는다. 목록은 본인을 제외하고 `active` 참가자를 모두 반환한다. 이 MVP에서는 참가자·대화 목록을 한 번에 반환하고 실제 목표 규모의 응답 시간을 검증한다. 메시지 이력은 반드시 페이지로 조회한다.

입장 예시:

```json
{
  "nickname": "수현",
  "self_description": "퇴근 후 작은 앱을 만드는 프론트엔드 개발자입니다.",
  "connection_intent": "사이드 프로젝트를 만드는 사람과 시행착오를 나누고 싶어요."
}
```

상세 추천 예시. 이는 응답 형식 설명용 가상 결과이며 실제 AI 출력이 아니다:

```json
{
  "state": "ready",
  "viewer_profile_version": 2,
  "candidate_profile_version": 1,
  "reason": "두 분 모두 개인 프로젝트를 만들며 겪은 시행착오를 나누고 싶어 합니다."
}
```

`Reason.state`는 `ready`, `pending`, `unscored`, `failed`, `unavailable` 중 하나다. `Banner.evaluation_state`도 같은 집합을 쓰지만 목록에는 참여 중인 후보만 있으므로 `unavailable`은 나타나지 않는다. 유효한 설명이 없으면 `ready`로 표시하지 않고 `reason=null`로 반환한다. 중단한 상대는 상세에서 `unavailable`로 표현하며 다른 원문은 조회할 수 있다. 숫자 점수는 공개 응답에 넣지 않는다.

## 추천 버전·호출·정렬

- 두 원문을 실제로 바꾸면 `profile_version`을 증가시킨다. `expected_profile_version`이 현재와 다르면 `VERSION_CONFLICT`로 최신 입력을 다시 가져오게 한다. 값이 같으면 버전을 증가시키지 않는다.
- 참가자 추가·원문 변경·중단·재개 때 `Room.candidate_version`을 증가시킨다. 반복 중단·반복 재개처럼 실제 변화가 없으면 증가시키지 않는다.
- 전체 추천 순서는 조회자 버전과 후보 집합 버전이 모두 맞아야 유효하다. 개별 추천 이유는 조회자·후보의 원문 버전과 현재 참가 가능 상태를 확인한다. 다른 사람의 수정만으로 해당 두 사람의 설명까지 반드시 버릴 필요는 없다.
- 읽기 요청은 모델 완료를 기다리지 않는다. 필요한 추천 작업을 중복 없이 시작하고 `pending`을 반환한다. 완료 후 `recommendation.changed`를 알린다. 실패해도 참가자 조회는 200과 `failed` 상태를 반환한다.
- 기본 정렬은 `joined_at` 오름차순, 같으면 ID 오름차순이다. 유효하게 평가된 후보를 모델의 추천 순서대로 먼저, 나머지를 기본 정렬로 뒤에 둔다. 동순위도 기본 정렬을 사용한다. 모든 후보가 낮은 평가여도 목록을 비우지 않는다.
- 전체 작업 상태는 `pending`, `partial`, `ready`, `failed`다. 일부만 평가하기로 한 전략은 `partial` 결과로 표현할 수 있다. 미평가 후보의 점수·추천 이유를 생성한 것처럼 표시하지 않는다.
- 오류 뒤 자동 호출을 반복하지 않는다. 프론트의 재시도는 `POST /recommendations/refresh`로 요청한다. 같은 버전의 실행 중 작업은 재사용하며 202와 현재 상태를 반환한다. 같은 참가자의 수동 재시도는 5초에 한 번까지라는 기본값을 둔다.
- 기본 모델 작업 제한 시간은 15초다. 이는 서비스 성능 측정값이 아니라 실패 처리 상한이다. 모델 선택·예산·캐시·일괄 평가·부분 평가 전략은 AI 담당에게 맡긴다.

AI 모듈은 다음 의미의 계약으로 연결한다. 실제 모델 프롬프트와 내부 점수 범위는 AI 담당이 고른다.

```json
{
  "room_id": "room_demo",
  "candidate_version": 4,
  "viewer": {
    "id": "p_a",
    "profile_version": 2,
    "self_description": "작은 앱을 만드는 프론트엔드 개발자",
    "connection_intent": "개인 프로젝트 경험을 나누고 싶음"
  },
  "candidates": [
    {
      "id": "p_b",
      "profile_version": 1,
      "self_description": "혼자 디자인 도구를 만드는 디자이너",
      "connection_intent": "개인 프로젝트 시행착오를 이야기하고 싶음"
    }
  ]
}
```

```json
{
  "candidate_version": 4,
  "viewer_id": "p_a",
  "viewer_profile_version": 2,
  "evaluations": [
    {
      "participant_id": "p_b",
      "candidate_profile_version": 1,
      "rank": 1,
      "reason": "두 분 모두 개인 프로젝트 시행착오를 나누고 싶어 합니다."
    }
  ]
}
```

평가하지 않은 후보는 `evaluations`에 없으며 서버가 전체 목록과 병합한다. 중복·없는 후보 ID, 잘못된 버전, 형식 오류는 채택하지 않는다. 모델의 이유가 원문 근거를 따르는지는 평가 사례로 검증하고 출력에 적힌 점수를 정확성 증거로 삼지 않는다. 서버는 적용 직전 참가 상태와 버전을 다시 확인한다. 후보 순서는 양쪽 의도를 사용하되 조회자마다 다를 수 있고, 모든 쌍에 대칭 점수를 강제하지 않는다.

## 메시지 저장·재시도·이력

```json
{
  "recipient_id": "p_b",
  "client_message_id": "request-example-001",
  "text": "혼자 앱을 만들면서 가장 어려웠던 점이 무엇인가요?"
}
```

```json
{
  "message": {
    "id": "m_12",
    "conversation_id": "c_ab",
    "seq": 12,
    "sender_id": "p_a",
    "client_message_id": "request-example-001",
    "text": "혼자 앱을 만들면서 가장 어려웠던 점이 무엇인가요?",
    "created_at": "2026-09-19T10:00:00Z"
  },
  "replayed": false
}
```

`Message`는 위 예시의 필드다. 세션 인증과 요청 형식을 확인한 뒤 **행사 상태·행사 소속·요청 ID 중복·양쪽 참여 상태의 최종 확인과 새 메시지·대화 순번 갱신을 동일한 짧은 쓰기 트랜잭션**으로 수행한다. 사전 검사만으로 저장 여부를 결정하지 않는다. 닫힌 행사는 이전 메시지 재시도도 `ROOM_CLOSED`다. 열린 행사에서 같은 발신자·요청 ID의 기록이 있으면 정규화한 수신자·본문을 비교해 같으면 200, 다르면 `IDEMPOTENCY_CONFLICT`다. 이 기존 기록 반환은 참여 중단 뒤에도 허용하되 새 저장은 양쪽이 참여 중일 때만 허용한다. 중단·종료가 먼저 확정됐으면 새 저장하지 않는다. 동시 재전송도 유일 제약과 같은 트랜잭션 안에서 동일한 기록 하나로 처리한다.

이력 조회는 `after_seq`와 `before_seq`를 동시에 받지 않는다. `after_seq=N`은 N보다 큰 메시지를 오래된 순으로 최대 limit개, `before_seq=N`은 N보다 작은 메시지 중 최신 limit개, 둘 다 없으면 최신 limit개를 반환한다. 반환 배열은 항상 `seq` 오름차순이다.

```json
{
  "items": [],
  "has_more": false,
  "next_after_seq": null,
  "next_before_seq": null,
  "latest_seq": 12
}
```

배열이 있으면 `next_after_seq`는 반환된 마지막 순번, `next_before_seq`는 첫 순번이다. `has_more`는 요청 방향에 추가 페이지가 있는지 뜻한다. `after_seq`가 없으면 과거 방향이다. `latest_seq`는 서버가 확인한 해당 대화의 최신 저장 순번이며 읽음 표시가 아니다. 같은 시각에 저장된 메시지도 순번으로 구분한다.

## SSE와 누락 복원

| 이벤트 | 전달 대상 | 최소 데이터 |
| --- | --- | --- |
| `ready` | 구독한 본인 | `{ "room_status", "candidate_version" }` |
| `participants.changed` | 같은 방의 입력 완료 참가자 | `{ "candidate_version" }` |
| `recommendation.changed` | 해당 조회자만 | `{ "candidate_version", "state" }` |
| `conversation.changed` | 대화의 두 당사자만 | `{ "conversation_id", "latest_seq" }` |
| `self.changed` | 본인의 열린 연결들 | `{ "participation_status", "profile_version" }` |
| `room.closed` | 해당 방의 열린 연결들 | `{ "closed_at" }` |

서버는 구독자를 등록한 뒤 `ready`를 보낸다. 프론트는 `ready` 이후 본인·참가자·대화 목록을 조회하고 조회 중 수신한 알림도 반영한다. 메시지 알림은 본문을 방송하지 않고 해당 대화의 이력을 다시 조회하는 신호로 사용한다. 재연결은 매번 같은 절차를 수행한다. 이 MVP는 SSE 과거 이벤트 재생을 구현하지 않으며 `Last-Event-ID`만으로 복원을 보장하지 않는다.

전송 성공·SSE 알림·이력 조회 결과는 메시지 ID로 합친다. 여러 페이지로 복원할 때 `has_more`가 끝날 때까지 읽고, 조회 중 받은 `latest_seq`보다 로컬의 연속 순번이 작으면 다시 조회한다. 알림을 합쳐서 처리하더라도 마지막 알림을 버리지 않는다.

화면 복귀 때도 이력을 재조회한다. 저장 후 알림 전에 서버가 중단되더라도 재연결 조회로 메시지가 나타나야 한다. 연결이 살아 있는 상태의 알림 발행 실패에 대비해 활성 화면은 15초마다 대화 목록과 열린 대화의 빠진 이력을 재조회하는 기본값을 둔다. 서버 종료·이벤트 오류에 따른 연결 재시도와 DB 이력의 보관은 별개다.

행사 종료 이벤트를 받으면 프론트는 개인별 화면 상태를 비우고 `EventSource.close()` 후 종료 안내를 표시한다. 앱 복귀·재조회에서 `ROOM_CLOSED`가 나와도 동일하게 처리한다. **한 번 종료로 인식한 방은 늦게 도착한 이전 조회·전송·추천 응답이나 대기 중 알림으로 다시 열지 않는다.** 진행 중 요청을 취소하고, 취소할 수 없던 요청의 결과도 적용하지 않는다. 서버는 종료 뒤 개인별 이벤트를 더 내보내지 않고 스트림을 닫는다. 종료 후 완료된 AI 작업도 저장·방송하지 않으며 삭제 작업 뒤 원문이나 추천 캐시를 다시 만들지 않는다.

## 오류

```json
{
  "error": {
    "code": "PARTICIPATION_STOPPED",
    "message": "현재 새 메시지를 주고받을 수 없습니다.",
    "fields": {}
  }
}
```

| HTTP | 코드 | 프론트 동작 |
| --- | --- | --- |
| 401 | `SESSION_REQUIRED` | 세션 확인. 기존 권한이 없으면 입장 화면 |
| 403 | `PARTICIPATION_REQUIRED` | 먼저 참여 정보 입력 |
| 403 | `FORBIDDEN` | 허용되지 않은 출처·운영 권한 요청 거부 |
| 404 | `NOT_FOUND` | 다른 방 참가자·본인 것이 아닌 대화도 같은 응답 |
| 409 | `PARTICIPATION_STOPPED` | 본문 유지, 중단 상태 안내. 자동 재전송하지 않음 |
| 409 | `VERSION_CONFLICT` | 최신 입력 조회 후 변경 내용 다시 확인 |
| 409 | `IDEMPOTENCY_CONFLICT` | 같은 요청 ID의 다른 전송. 새 메시지인지 확인 후 새 ID 사용 |
| 410 | `ROOM_CLOSED` | 종료 안내, 개인별 조회·재전송 중단 |
| 422 | `INVALID_INPUT` | `fields`에 필드별 원인 표시 |
| 429 | `RATE_LIMITED` | `Retry-After` 이후 재시도 |
| 503 | `TEMPORARILY_UNAVAILABLE` | 작성 내용 유지, 동일 요청 ID로 재시도 가능 |

FastAPI 기본 검증 오류도 이 형식으로 통일한다. 상대 방·대화의 존재 여부를 상세 오류로 노출하지 않는다. 인증된 자기 방의 종료 여부 확인과 상대 자원 권한 확인을 적용하고, 종료 후에는 응답에 참가자·메시지 원문을 싣지 않는다.
