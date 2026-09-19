# BLE MVP API 계약 v0.1

2026-09-20. 제품 행동은 [개발 기준](development-contract.md), 변경 이력은 [B1~B14](product-direction.md)를 따른다. 이 문서는 **API v0.1로 확정한 계약**이다. 기계 판독 가능한 원본은 [OpenAPI 3.1 명세](openapi.yaml)이며, 두 문서는 함께 변경한다. FastAPI·Redis 제품 API의 구현·검증 범위는 [서버 안내](../server/README.md)를 따른다. 이전 방별 API와 쿠키 계약은 [이력](history/event-mvp/docs/api-contract.md)에만 보존한다.

## 공통 규칙

- 기본 경로는 `/api/v1`이고 모든 요청과 응답의 본문은 `application/json`이다.
- 설치 등록을 제외한 모든 API는 `Authorization: Bearer <installation_credential>`을 요구한다. 자격 증명은 설치 등록 응답에서 한 번 발급하며 Android의 보호된 저장소에 보관한다.
- 공개 `user_id`와 BLE 임시 ID는 인증 수단이 아니다. 요청 본문의 발신자 ID도 신뢰하지 않으며 발신자는 자격 증명으로 결정한다.
- JSON 필드는 `snake_case`다. 서버 시간은 UTC RFC 3339 문자열이다. 만료 판단은 서버 수신 시각, 메시지 정렬은 서버가 대화별로 발급한 `seq`만 사용한다. UUID나 휴대폰 시각을 순서·만료 기준으로 사용하지 않는다.
- UUID 필드는 소문자·하이픈 표기의 UUID 문자열이며, `installation_request_id`와 `client_message_id`는 클라이언트가 새로 생성한 UUIDv4다. 중복 방지 키는 이 두 API에만 있다.
- 알 수 없는 JSON 필드는 거부한다. 문자열 길이는 Unicode 코드 포인트 기준이며 앞뒤 공백을 자동으로 의미 있는 내용으로 바꾸지 않는다.
- 성공 저장 후에만 성공을 응답한다. 알림이나 향후 실시간 전달은 저장을 대신하지 않는다.

오류는 모든 엔드포인트에서 같은 모양을 사용한다. `details`는 없으면 빈 객체다.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "nickname must contain 1 to 20 characters",
    "details": { "field": "nickname" }
  }
}
```

공통 상태 코드는 `400`(잘못된 JSON·요청), `401`(자격 없음/무효), `404`(접근 가능한 자원 없음), `409`(중복 방지 충돌), `422`(필드 검증 실패), `503`(저장소 등 일시 장애)다. 권한 조건을 충족하지 못한 첫 메시지는 `403`이다. FastAPI 기본 검증 오류도 위 형식으로 변환한다.

## 공개 객체

공개 프로필은 아래 세 필드 전부다. `profile_revision` 같은 내부 버전은 어느 공개 API에도 노출하지 않는다.

```json
{
  "nickname": "민지",
  "self_description": "접근성 있는 앱을 만드는 디자이너예요.",
  "connection_intent": "모바일 접근성에 관심 있는 개발자를 만나고 싶어요."
}
```

| 필드 | 제약 |
| --- | --- |
| `nickname` | 1~20 Unicode 코드 포인트 |
| `self_description` | 1~500 Unicode 코드 포인트 |
| `connection_intent` | 1~500 Unicode 코드 포인트 |
| 메시지 `text` | 1~2,000 Unicode 코드 포인트 |

## 설치 인증

### `POST /api/v1/installations`

인증 없이 호출한다. `installation_request_id`는 이 설치 등록 시도에서 생성한 UUIDv4이고 앱 재시도 동안 유지한다. `platform`은 현재 `android`만 허용하며 중복 판정에 포함되는 등록 내용이다.

```json
{ "installation_request_id": "3d594650-3436-4b90-a2e2-68b57325d6c9", "platform": "android" }
```

최초 성공은 `201 Created`, 같은 키와 같은 등록 내용의 재시도는 `200 OK`로 같은 결과를 반환한다.

```json
{
  "user_id": "6d4963fb-f63d-4a61-a144-79a01dd39529",
  "installation_credential": "ic_7uM0Qm9zQW...",
  "created_at": "2026-09-20T01:20:30Z"
}
```

서버는 재전송할 자격 증명을 암호화해 최초 성공부터 10분 동안만 보관한다. 같은 키를 다른 등록 내용에 쓰면 `409 IDEMPOTENCY_CONFLICT`다. 10분 뒤 같은 키를 다시 받으면 새 설치를 만들거나 자격을 재발급하지 않고 `409 IDEMPOTENCY_REPLAY_EXPIRED`를 반환한다. 키와 생성된 설치의 연결 기록은 설치 수명 동안 유지한다.

## 내 정보와 프로필

### `GET /api/v1/me`

현재 설치 사용자를 조회한다. 프로필 작성 전 `profile`은 `null`이다.

```json
{
  "user_id": "6d4963fb-f63d-4a61-a144-79a01dd39529",
  "profile": null,
  "discovery_enabled": false
}
```

### `POST /api/v1/me/profile`

세 공개 프로필 필드를 전부 받는다. 프로필이 없으면 생성하고 있으면 전달된 전체 값으로 덮어쓴다. 일부 수정은 지원하지 않는다. 같은 값을 반복 제출해도 `200 OK`이며 내부 버전 증가나 추천 무효화 같은 불필요한 변경을 만들지 않는다.

```json
{
  "nickname": "민지",
  "self_description": "접근성 있는 앱을 만드는 디자이너예요.",
  "connection_intent": "모바일 접근성에 관심 있는 개발자를 만나고 싶어요."
}
```

응답은 `200 OK`와 저장된 공개 프로필이다. 세 필드가 비어 있거나 한도를 넘으면 `422 VALIDATION_ERROR`다.

## 발견 상태와 BLE 임시 ID

### `POST /api/v1/me/discovery`

```json
{ "enabled": true }
```

현재 발견 상태를 설정하고 `200 OK`로 `{"discovery_enabled": true}`를 반환한다. 같은 상태의 반복 요청은 현재 상태를 그대로 반환하고 불필요한 변경을 만들지 않는다. 발견을 끄면 아직 대화가 없는 사용자는 이 사용자를 상대로 새 대화를 시작할 수 없다. 이미 존재하는 대화와 이력에는 영향을 주지 않는다.

### `POST /api/v1/discovery/identifiers`

요청 본문은 없다. 발견이 켜져 있고 프로필이 완성된 사용자만 호출할 수 있다. 조건을 충족하지 않으면 각각 `409 DISCOVERY_DISABLED`, `409 PROFILE_REQUIRED`다.

```json
{
  "identifier": "Xh9B2pL8QyEDkqkwYF4QxA",
  "issued_at": "2026-09-20T01:20:30Z",
  "refresh_after": "2026-09-20T01:24:30Z",
  "expires_at": "2026-09-20T01:25:30Z"
}
```

임시 ID는 128비트 암호학적 난수를 패딩 없는 base64url로 표현한 22자 값이다. 발급 후 5분간 유효하며 4분이 지난 시점부터 갱신할 수 있다. 갱신 전에는 현재 ID를 반환하고, 갱신 시점에는 원자적으로 새 ID로 교체한다. 교체된 이전 ID도 본래 만료 시점까지, 즉 최대 1분간 겹쳐 인정한다.

## 관측 보고와 프로필 반환

### `POST /api/v1/discovery/observations`

BLE 스캔에서 방금 얻은 임시 ID만 보낸다. 클라이언트 관측 시각과 사용자 ID는 받지 않는다. 한 요청에는 1~50개의 임시 ID를 담을 수 있다.

```json
{
  "identifiers": [
    "Xh9B2pL8QyEDkqkwYF4QxA",
    "JmlIT7R8QT0qqTcV1ZlD-g"
  ]
}
```

서버는 요청 수신 시각을 유효한 `(observer, observed)` 관측의 `last_seen_at`으로 기록하거나 갱신한다. 각 ID의 현재/겹침 유효성, 자기 자신이 아닌지, 양쪽 사용자의 발견 상태와 프로필 완성 여부를 검사한다. 유효한 관측은 수신 시점부터 10분간 첫 대화 시작 권한으로 인정하며, 그 사이 BLE ID가 교체돼도 이미 확인한 관측의 만료 시각은 줄어들지 않는다.

```json
{
  "observed_users": [
    {
      "user_id": "34221035-a09f-4b0d-9df2-d1c84338ce50",
      "profile": {
        "nickname": "준호",
        "self_description": "작은 백엔드 시스템을 만들고 있어요.",
        "connection_intent": "BLE나 분산 시스템 이야기를 나누고 싶어요."
      },
      "recommendation": { "status": "unavailable" },
      "last_seen_at": "2026-09-20T01:22:00Z",
      "conversation_eligibility_expires_at": "2026-09-20T01:32:00Z"
    }
  ]
}
```

AI 추천은 후속 작업이므로 v0.1의 추천 상태는 항상 `unavailable`이다. 무효·만료·자기 자신·발견 OFF·중복 ID가 섞여 있어도 배치 전체를 실패시키지 않고 유효하게 관측된 사용자를 한 번씩만 반환한다. 반환 순서는 권한이나 추천 순위를 뜻하지 않는다. 요청 자체가 잘못됐거나 50개를 넘은 경우에만 `422`다.

별도 `GET /discovery/nearby`와 `GET /users/{user_id}`는 제공하지 않는다. 클라이언트는 마지막 성공 응답을 화면 복구용으로 보관할 수 있지만, 캐시를 새 관측이나 첫 메시지 권한의 증거로 제출할 수 없다.

> 보안 한계: 서버는 클라이언트가 실제로 방금 스캔했는지, 유효 시간 안에 캐시한 임시 ID를 다시 제출했는지 판별할 수 없다. 5분 ID 수명, 양쪽 발견 상태 검사, 서버 수신 시각 기준의 10분 권한으로 오용 범위를 제한한다. 이 신호는 위조 불가능한 위치 증명이 아니다.

## 채팅

### `GET /api/v1/conversations`

인증된 사용자가 속한 대화를 최근 메시지 저장 시각 내림차순으로 반환한다. 메시지가 없는 대화는 존재하지 않는다.

```json
{
  "conversations": [
    {
      "conversation_id": "70072e77-3287-4d5d-9f86-43d3736aeba0",
      "participant": {
        "user_id": "34221035-a09f-4b0d-9df2-d1c84338ce50",
        "profile": {
          "nickname": "준호",
          "self_description": "작은 백엔드 시스템을 만들고 있어요.",
          "connection_intent": "BLE나 분산 시스템 이야기를 나누고 싶어요."
        }
      },
      "last_message": {
        "message_id": "a1cc74c4-f976-45a7-9668-e15999c923f8",
        "conversation_id": "70072e77-3287-4d5d-9f86-43d3736aeba0",
        "sender_id": "6d4963fb-f63d-4a61-a144-79a01dd39529",
        "recipient_id": "34221035-a09f-4b0d-9df2-d1c84338ce50",
        "seq": 1,
        "text": "안녕하세요! BLE 구현 이야기를 나눠볼까요?",
        "created_at": "2026-09-20T01:23:00Z"
      }
    }
  ]
}
```

### `POST /api/v1/messages`

```json
{
  "recipient_id": "34221035-a09f-4b0d-9df2-d1c84338ce50",
  "client_message_id": "bf04899e-d611-47a8-8ea3-b351665ceef3",
  "text": "안녕하세요! BLE 구현 이야기를 나눠볼까요?"
}
```

두 사용자 사이에 대화가 없으면 저장 직전에 다음을 원자적으로 확인한 뒤 대화와 첫 메시지를 함께 만든다.

1. 발신자가 수신자를 관측한 서버 기록이 최근 10분 안에 유효하다.
2. 발신자와 수신자 모두 발견이 켜져 있다.
3. 양쪽 프로필이 완성돼 있다.

실패는 `403 OBSERVATION_REQUIRED`, `403 DISCOVERY_DISABLED`, `409 PROFILE_REQUIRED`로 구분한다. 수신자가 존재하지 않으면 `404 RECIPIENT_NOT_FOUND`, 자기 자신에게 보내면 `422 VALIDATION_ERROR`다. 동시에 양쪽이 첫 메시지를 보내도 사용자 쌍당 대화는 하나만 생성한다.

이미 두 사용자 사이에 대화가 있으면 관측 만료, 현재 거리, 어느 쪽의 발견 상태와 무관하게 전송할 수 있다. 메시지는 대화별 단조 증가 정수 `seq`를 원자적으로 부여받는다. 최초 저장은 `201 Created`로 메시지 객체를 반환한다.

```json
{
  "message_id": "a1cc74c4-f976-45a7-9668-e15999c923f8",
  "conversation_id": "70072e77-3287-4d5d-9f86-43d3736aeba0",
  "sender_id": "6d4963fb-f63d-4a61-a144-79a01dd39529",
  "recipient_id": "34221035-a09f-4b0d-9df2-d1c84338ce50",
  "seq": 1,
  "text": "안녕하세요! BLE 구현 이야기를 나눠볼까요?",
  "created_at": "2026-09-20T01:23:00Z"
}
```

`client_message_id`의 범위는 발신 설치다. 같은 ID·수신자·본문의 재시도는 `200 OK`로 원래 메시지를 반환하며 새 `seq`를 만들지 않는다. 같은 ID를 다른 수신자나 본문에 재사용하면 `409 IDEMPOTENCY_CONFLICT`다. 메시지 키 연결과 원래 결과는 메시지 수명 동안 유지한다.

### `GET /api/v1/conversations/{conversation_id}/messages`

대화 당사자만 조회한다. 당사자가 아니거나 없는 대화는 모두 `404 CONVERSATION_NOT_FOUND`다.

| 쿼리 | 기본값 | 제약 | 의미 |
| --- | --- | --- | --- |
| `after_seq` | `0` | 0 이상의 정수 | 이 값보다 큰 `seq`부터 조회 |
| `limit` | `50` | 1~100 | 최대 반환 개수 |

응답 항목은 `seq` 오름차순이다. `has_more`가 참이면 마지막 항목의 `seq`인 `next_after_seq`로 다음 페이지를 요청한다. 거짓이면 `next_after_seq`는 `null`이다.

```json
{
  "messages": [
    {
      "message_id": "a1cc74c4-f976-45a7-9668-e15999c923f8",
      "conversation_id": "70072e77-3287-4d5d-9f86-43d3736aeba0",
      "sender_id": "6d4963fb-f63d-4a61-a144-79a01dd39529",
      "recipient_id": "34221035-a09f-4b0d-9df2-d1c84338ce50",
      "seq": 1,
      "text": "안녕하세요! BLE 구현 이야기를 나눠볼까요?",
      "created_at": "2026-09-20T01:23:00Z"
    }
  ],
  "next_after_seq": null,
  "has_more": false
}
```

## 데이터·동시성 경계

- 사용자·설치 자격·프로필·대화·메시지는 복원 가능하게 저장한다. 임시 ID와 관측의 만료는 사용자나 대화 삭제가 아니다.
- 프로필 내부 버전, 발견 상태 변경 버전, 중복 방지 키 연결은 서버 내부 데이터다. 공개 응답에 내부 버전을 싣지 않는다.
- 프로필 수정, 발견 OFF, 관측 만료와 첫 메시지가 경합하면 첫 메시지 저장 직전에 조건을 다시 검사한다. Redis 원자 처리 안에서 외부 AI를 호출하지 않는다.
- 대화 열기나 관측만으로 관계를 만들지 않는다. 첫 메시지 저장이 신규 대화의 시작이다.
- `room_id`, 행사 종료, 요청/수락 상태, `is_demo`, 운영자 API, QR API는 이 계약에 없다.

## AI 모듈 경계

`server/app/ai/`는 서버가 허용한 조회자·후보의 ID, 자기소개, 교류 의도와 내부 입력 버전을 받아 방향별 평가를 생성하는 독립 모듈이다. 선택 모델은 `claude-haiku-4-5`다. [호출·설정 안내](../server/docs/ai.md)와 [모델 비교 결과](../server/docs/ai-model-comparison.md)를 따른다.

**이 모듈의 결과는 API v0.1 응답 스키마가 아니다.** 관측 응답의 `recommendation.status`는 계속 `unavailable`이며, 공개 프로필에 내부 버전이나 점수를 추가하지 않는다. 연결하려면 서버 내부 프로필·발견 상태 버전 관리, 현재 관측·권한 재검사, 공개 응답으로의 변환을 구현하고 OpenAPI와 클라이언트 계약을 함께 변경해야 한다.

- 모든 유효 후보를 보존하고 평가 완료·근거 부족·실패·미평가를 구분한다. 추천 근거 부족은 선택적 입력 보완 안내에 사용할 수 있지만 목록 노출·채팅 권한을 바꾸지 않는다. 이유는 상세 화면에서 읽기 쉬운 1~2문장을 목표로 하며 숫자 점수는 공개하지 않는다.
- AI는 후보를 창작하거나 근접·참여·대화 권한을 바꾸지 않는다. 낮은 평가나 실패도 첫 메시지의 기존 권한 조건을 대신하지 않는다. 기존 대화의 유지·전송 계약은 동일하다.
- BLE 재관측·임시 ID 회전마다 LLM을 호출하지 않는다. 양쪽 사용자·입력 버전·조회 방향·모델·프롬프트·추론 설정으로 캐시를 구분한다. 알림 적합성에는 현재 임계값을 적용하고, 실제 발송 직전의 관측·참여·중복 조건 확인은 서버가 담당한다.
- ‘주변 후보 20명·목록 즉시 표시·추천 갱신 5초 이내’는 AI-D5의 초기 검증 목표이며 후보 상한이나 달성한 성능이 아니다. 현재 Haiku의 20명 첫 평가 중앙값은 8.878초로 목표 미달이다.

## 후속 범위

API v0.1·프론트엔드·Android BLE 구현과 그 검증은 각 구현 문서를 따른다. AI 모듈의 HTTP·Android 연결, 추천 알림과 백그라운드 동작 검증, SSE/WebSocket 실시간 전달은 후속 범위다. 이벤트 룸·QR·운영자 종료·관리자 기능은 현재 계약에 포함하지 않는다.
