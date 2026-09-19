# AI 추천 모듈 (`server/app/ai`)

2026-09-20. 서버가 허용한 조회자·후보를 받아 방향별 추천 평가를 만드는 독립 비동기 모듈이다. HTTP 라우터·프론트·저장소를 포함하지 않으며, 후보를 만들거나 지우지 않고 발견·참여·대화 권한을 바꾸지 않는다. 계약은 [API 계약의 AI 모듈 경계](../../docs/api-contract.md#ai-모듈-경계)와 [AI 지침](../../spec/prompts.md)을 따른다.

**이 문서는 구현과 모의 테스트 결과만 기술한다.** 실제 모델 호출·품질 비교·성능 목표 달성은 [AI 추천 검증 기록](ai-validation.md)(검증 담당 소유: `server/evals/`, `server/tests/test_ai_acceptance.py`)의 실행 결과로만 주장한다. 리뷰 담당의 결함 보고는 [AI 구현 리뷰](ai-review.md)에 있다.

## 공개 이름

모두 `from app.ai import ...`로 가져온다.

### DTO (Pydantic, `frozen=True`, `extra="forbid"`)

| 이름 | 필드 |
| --- | --- |
| `ParticipantProfile` | `user_id`, `self_description`, `connection_intent`, `profile_revision` |
| `RecommendationRequest` | `viewer: ParticipantProfile`, `candidates: tuple[ParticipantProfile, ...]` |
| `GroundingExcerpt` | `source: ExcerptSource`, `quote: str`, `verified: bool` |
| `CandidateRecommendation` | `candidate_user_id`, `status`, `rank`, `score`, `reason`, `excerpts`, `intent_conflict`, `notification_eligible`, `failure_code`, `viewer_profile_revision`, `candidate_profile_revision`, `from_cache` + `verified_excerpts`, `has_unverified_excerpts` |
| `RecommendationResult` | `viewer_user_id`, `viewer_profile_revision`, `recommendations`, `policy_version`, `model`, `prompt_digest`, `inference_digest`, `generated_at`, `anomalies`, `cache_hits`, `gateway_calls`, `usage`, `duration_ms` |
| `TokenUsage` | `input_tokens`, `output_tokens`, `total_tokens`, `complete`, `reported_calls`, `provider_calls` |

보조 접근자: `RecommendationResult.by_candidate_id(user_id)`, `RecommendationResult.notification_candidate_ids`, `RecommendationRequest.candidate_by_id(user_id)`.

`RecommendationRequest`는 후보 목록의 중복 `user_id`와 조회자 자신이 후보로 들어온 경우를 조용히 제거하지 않고 `AIInputError`로 거부한다. 입력을 말없이 고치면 서버가 기대한 후보 수와 결과가 어긋난다.

### 열거형

- `EvaluationStatus`: `EVALUATED` / `INSUFFICIENT_EVIDENCE` / `FAILED` / `PENDING`
- `ExcerptSource`: `VIEWER_SELF_DESCRIPTION` / `VIEWER_CONNECTION_INTENT` / `CANDIDATE_SELF_DESCRIPTION` / `CANDIDATE_CONNECTION_INTENT`
- `FailureCode`: `CONFIGURATION_MISSING` / `GATEWAY_TIMEOUT` / `GATEWAY_HTTP_ERROR` / `GATEWAY_NETWORK_ERROR` / `INVALID_JSON` / `SCHEMA_MISMATCH` / `MISSING_IN_RESPONSE` / `DUPLICATE_IN_RESPONSE` / `UNGROUNDED_REASON` / `OUTPUT_TRUNCATED` / `INPUT_TOO_LONG` / `CANCELLED`

네 가지 상태는 서로 대체할 수 없다. `INSUFFICIENT_EVIDENCE`는 '추천 근거 부족'이며 부적합·오류가 아니다. `PENDING`은 아직 평가하지 않은 상태이고 낮은 점수가 아니다. `FAILED`에는 항상 `failure_code`가 있고 `score`·`reason`은 `None`이다.

### 서비스와 헬퍼

- `RecommendationService(settings=None, *, gateway=None, cache=None, prompt=None, policy=None)`
- `await service.recommend(request) -> RecommendationResult`
- `await service.aclose()`, `async with RecommendationService(...) as service:`
- `service.configuration_error() -> FailureCode | None`
- `service.require_configuration() -> None` — 시작 시 크게 실패시키고 싶을 때. 누락된 이름만 담아 `AIConfigurationError`를 올린다
- `service.inference_digest`, `service.settings`, `service.policy`
- `pending_result(request, *, policy_version=None) -> RecommendationResult`
- `matches_current_inputs(result, request) -> bool`
- `stale_candidate_ids(result, request) -> tuple[str, ...]`

### 주입 지점

- `AISettings` — `AI_` 접두 환경변수. `server/.env`를 파일 위치 기준으로 읽으므로 작업 디렉터리와 무관하게 같은 값을 쓴다.
- `NotificationPolicy`, `NotificationDecision`
- `RecommendationCache`(Protocol), `InMemoryRecommendationCache`, `RedisRecommendationCache`, `NullRecommendationCache`
- `ChatGateway`(Protocol), `OpenAICompatibleGateway`
- `PromptProvider`(Protocol), `DefaultPromptProvider`, `SYSTEM_INSTRUCTIONS`
- `TokenUsage` (위 '토큰 사용량' 절)
- 예외: `AIError`, `AIInputError`, `AIConfigurationError`, `AIGatewayError`, `AIGatewayHTTPError`, `AITimeoutError`, `AIResponseError`, `AIResponseTruncatedError`

## 선택된 모델과 로컬 설정 (2026-09-20)

| 항목 | 값 |
| --- | --- |
| `AI_BASE_URL` | `https://ai.cs.kookmin.ac.kr/v1` |
| `AI_MODEL` | `claude-haiku-4-5` |
| `AI_API_KEY` | `server/.env`에 설정됨 (값은 기록·출력하지 않는다) |
| 프롬프트 | `bside-recommendation` `2026-09-20.2`, digest `32db67109c375cf1` |
| `AI_BATCH_SIZE` / `AI_MAX_CONCURRENT_REQUESTS` | `5` / `4` (기본값 유지) |
| `AI_NOTIFICATION_SCORE_THRESHOLD` | `0.72` (**잠정값**) |

`server/.env`에 없던 비밀값이 아닌 두 줄(`AI_BASE_URL`, `AI_MODEL`)만 덧붙였다. 기존 줄·주석·값은 고치지 않았다. 이 설정으로 `AISettings().missing_configuration()`이 비고 `configuration_error()`가 `None`이다.

**이 선택이 뜻하는 것과 뜻하지 않는 것**

- 모델 선택과 실호출 결과는 [AI 추천 검증 기록](ai-validation.md)에 있다. 그 문서의 실행 기록이 근거이며, 이 문서는 어떤 모델이 더 낫다는 주장을 하지 않는다.
- `0.72`는 저장된 출력으로 돌린 sweep에 근거한 **잠정값**이다. 여전히 보정 전이며 실사용 오탐·누락으로 조정한다.
- 배치 5·동시성 4는 검증 담당이 고정 프롬프트로 성능 측정을 마칠 때까지 기본값을 그대로 둔 것이다. 측정 결과로 바뀔 수 있다.
- **API 라우터와 Android에는 아직 연결되지 않았다.** 이 설정은 모듈을 단독으로 실행·평가할 수 있게 만든 것이고, `app.main`은 이 모듈을 아직 호출하지 않는다.

### 현재 API v0.1과의 연결 경계

통합한 `main`(`a85292f`)의 서버·웹·Android는 BLE 관측과 채팅까지 구현돼 있다. 공개 관측 응답은 `recommendation.status: unavailable`만 허용하며 내부 추천 DTO를 그대로 직렬화할 수 없다. 이 PR은 기존 API 동작을 유지하면서 독립 AI 모듈과 평가 도구를 추가한다. 사용자는 추가 비교 후 Haiku 유지를 확정했다.

- `app.store.Store.put_profile()`과 `set_discovery()`는 현재 값을 저장하지만 입력·발견 참여 버전을 관리하지 않는다. 모듈의 필수 `profile_revision`을 연동하려면 서버 내부 버전 관리와 평가 완료 시 최신 입력·참여·관측 재검사를 먼저 구현해야 한다. 버전을 공개 프로필에 추가하는 것은 현재 계약에 없다.
- API 입력은 자기소개·교류 의도 각각 500자다. 모듈의 2,000자 방어 한도는 공개 API 한도를 완화하지 않는다.
- 웹의 `ready` 상태·이유 표시와 AI의 내부 상태·순위를 연결할 응답 어댑터, OpenAPI·클라이언트의 상태 계약, 알림 중복 억제·실제 발송은 후속 작업이다. 기존 첫 메시지와 대화 유지 권한은 추천 결과와 별개다.
- 배포에서도 `AI_MODEL=claude-haiku-4-5`와 게이트웨이 주소·키를 명시해야 한다. 코드의 모델 기본값은 비워 두고, `main`의 Capacitor용 `https://localhost` CORS 설정을 유지한다.

## 통합 예시

```python
from redis.asyncio import Redis

from app.ai import (
    AISettings,
    ParticipantProfile,
    RecommendationRequest,
    RecommendationService,
    RedisRecommendationCache,
    matches_current_inputs,
    pending_result,
)

# 시작 시 한 번. HTTPX 클라이언트는 첫 호출에서 만들어 재사용한다.
def create_recommendation_service(redis: Redis) -> RecommendationService:
    return RecommendationService(AISettings(), cache=RedisRecommendationCache(redis))

# 종료 시. app.main의 lifespan `finally`에서 호출한다.
# await service.aclose()

request = RecommendationRequest(
    viewer=ParticipantProfile(
        user_id="u_1",
        self_description="프론트엔드 3개 프로젝트를 했고 발표 경험이 많습니다.",
        connection_intent="GitHub Actions 배포 권한 오류를 같이 봐줄 사람을 찾고 있어요.",
        profile_revision=3,
    ),
    candidates=(
        ParticipantProfile(
            user_id="u_2",
            self_description="학과 서버를 1년 운영했고 CI 파이프라인을 구축했습니다.",
            connection_intent="서비스 기획을 같이 고민할 사람을 만나고 싶어요.",
            profile_revision=7,
        ),
    ),
)

# 1) 목록은 즉시 표시한다. 호출·캐시 접근이 없는 동기 함수다.
immediate = pending_result(request)

# 2) 평가는 따로 스케줄한다. await 동안 양쪽이 입력을 고치거나 발견을 끌 수 있다.
result = await service.recommend(request)

# 3) 노출·알림 직전에 서버가 다시 확인한다.
#    반드시 "지금의" 서버 상태로 요청을 다시 만들어 비교한다. 방금 보낸 request와
#    비교하면 await 동안 일어난 수정을 절대 잡아내지 못한다.
current_request = build_request_from_current_state(viewer_id)  # 서버 구현
if matches_current_inputs(result, current_request) and discovery_unchanged(...):
    for item in result.recommendations:
        ...  # item.reason은 상세 화면용, item.score는 화면에 노출하지 않는다
```

`recommend()`는 요청 하나에 조회자 한 명을 다룬다. 반대 방향(`u_2`가 `u_1`을 볼 때)의 이유는 다를 수 있으므로 별도 요청으로 평가한다.

### 목록 즉시 표시와 비동기 평가

`pending_result(request)`는 게이트웨이·캐시·네트워크를 전혀 건드리지 않고 모든 후보를 `PENDING`으로 만든다. API는 이것을 바로 응답하고 `recommend()`를 백그라운드 작업으로 돌린 뒤 결과를 나중에 노출하면 된다. `PENDING`을 추천 성공이나 낮은 점수로 표시하지 않는다.

### 서버가 반드시 다시 해야 하는 일

캐시 적중 여부와 무관하게, 결과를 **노출하거나 알림을 보내기 직전에** 서버가 원자적으로 다시 확인한다. 이 모듈은 그 확인을 대신하지 않는다.

1. 양쪽 `profile_revision`이 **지금의** 프로필과 같은지. 평가를 요청할 때 만든 `RecommendationRequest`가 아니라 현재 서버 상태로 요청을 다시 만들어 비교한다.
2. 발견 참여(`discovery_enabled`) 버전이 평가를 요청하던 시점과 같은지. **이 모듈의 DTO에는 발견 참여 버전이 없다.** `RecommendationResult`는 `profile_revision`만 담으므로, 서버가 평가를 시작할 때 양쪽의 발견 참여 버전을 따로 기록해 두었다가 노출 직전에 그 값과 비교해야 한다.
3. 현재 발견 참여 상태와 근접 관측이 여전히 유효한지.
4. 알림 중복 억제 키로 같은 상대를 다시 알리지 않는지.

`matches_current_inputs(result, current_request)` / `stale_candidate_ids(result, current_request)`는 1번의 입력 스냅샷 비교만 돕는 헬퍼다. 두 함수에 **방금 평가를 요청할 때 쓴 그 요청을 그대로 넘기면 아무 변화도 잡히지 않는다.** 2~4번과 원자적 재확인, 권한 판단은 서버 몫이다. **`notification_eligible`은 권한이 아니라 추천 품질 판단이다.**

## 설정

모두 `AI_` 접두 환경변수다. 값은 모두 측정 전에 고른 구현 기본값이며 사용자 확정값이 아니다.

| 환경변수 | 기본값 | 뜻 |
| --- | --- | --- |
| `AI_API_KEY` | 없음 | 게이트웨이 비밀키. `SecretStr`로 보관하며 로그·예외·`repr`에 값이 나오지 않는다 |
| `AI_BASE_URL` | 없음 | OpenAI 호환 게이트웨이의 기준 URL. 현재 `server/.env`는 해커톤 게이트웨이 |
| `AI_MODEL` | 없음 | 모델 ID. **임의 기본값을 두지 않는다**. 현재 `server/.env`는 `claude-haiku-4-5` |
| `AI_CHAT_COMPLETIONS_PATH` | `/chat/completions` | 기준 URL에 붙일 경로 |
| `AI_USE_JSON_RESPONSE_FORMAT` | `true` | `response_format={"type":"json_object"}` 전송 여부 |
| `AI_CONNECT_TIMEOUT_SECONDS` | `5.0` | 연결 timeout |
| `AI_REQUEST_TIMEOUT_SECONDS` | `20.0` | 개별 HTTP 요청 timeout |
| `AI_TOTAL_TIMEOUT_SECONDS` | `45.0` | 요청 전체 상한. 동시성 제한에 걸려 **대기 중인 배치까지** 포함한다 |
| `AI_MAX_ATTEMPTS` | `1` | 재시도 포함 시도 횟수. 재시도 이득은 미측정이라 기본은 1회 |
| `AI_MAX_CONCURRENT_REQUESTS` | `4` | 동시 게이트웨이 호출 수 |
| `AI_BATCH_SIZE` | `5` | 한 호출에 넣을 후보 수. 후보 상한이 아니며 출력 예산에 맞춰 줄어들 수 있다 |
| `AI_TEMPERATURE` | `0.2` | 재현성을 위해 낮게 둔다 |
| `AI_MAX_OUTPUT_TOKENS` | `4096` | 한 호출의 응답 토큰 상한 |
| `AI_OUTPUT_TOKENS_PER_CANDIDATE` | `400` | 후보 1명당 필요한 출력 토큰 추정치 |
| `AI_OUTPUT_TOKENS_OVERHEAD` | `256` | 후보 수와 무관한 출력 여유분 |
| `AI_MAX_FIELD_CHARS` | `2000` | 지원하는 입력 길이. 초과 입력은 **자르지 않고** 실패 처리한다 |
| `AI_MAX_REASON_CHARS` | `220` | 이 길이를 넘는 이유는 `anomalies`에 기록만 하고 잘라내지 않는다 |
| `AI_MIN_EXCERPT_CHARS` | `6` | 이보다 짧은 인용은 근거로 인정하지 않는다 |
| `AI_CACHE_NAMESPACE` | `ai:rec:v1` | 캐시 키 접두 |
| `AI_CACHE_TTL_SECONDS` | `900` | 캐시 항목 수명 |
| `AI_POLICY_VERSION` | `ai-policy-2026-09-20-uncalibrated` | 평가 정책 버전. 캐시 식별에 포함된다 |
| `AI_NOTIFICATION_SCORE_THRESHOLD` | `0.72` | **미보정값.** 아래 참고 |
| `AI_NOTIFICATION_REQUIRE_MUTUAL_EVIDENCE` | `true` | 조회자 쪽·후보 쪽 각각에서 검증된 인용 요구 |
| `AI_NOTIFICATION_REQUIRE_INTENT_EVIDENCE` | `true` | 양쪽 **교류 의도**에서 검증된 인용 요구 |
| `AI_NOTIFICATION_MAX_PER_REQUEST` | `3` | 한 요청에서 적합 표시할 최대 인원 |

`server/.env`에는 `AI_API_KEY`·`AI_BASE_URL`·`AI_MODEL`이 있다. `server/.env.example`에는 아직 이 값을 추가하지 않았다. API 팀의 설정 파일과 충돌을 피하려고 AI 설정은 `app.config.Settings`와 분리한 `AISettings`에만 둔다.

## 평가 방식

- 한 호출에 후보 여러 명을 넣는 배치 평가를 기본으로 한다(`AI_BATCH_SIZE`). 후보 20명은 기본 설정에서 4회 호출로 나뉘며, 이는 후보 상한이 아니다.
- **점수는 배치와 무관한 절대 기준이다.** 프롬프트가 같은 조회자·후보 쌍이면 누구와 함께 묶였든 같은 점수를 내도록 명시하고, 배치 안에서 순위를 매기거나 점수를 분산시키지 말라고 지시한다. 쌍 단위 캐시 재사용이 의미를 가지려면 이 성질이 필요하다. **실제 모델에서 이 성질이 지켜지는지는 아직 측정하지 않았다.** 그때까지 `batch_size`를 캐시 식별에 포함해 서로 다른 배치 크기의 결과를 섞지 않는다.
- 참가자 입력은 평가할 데이터다. 지시는 system 메시지에만 두고, 참가자 텍스트는 user 메시지의 JSON 문서 안에만 넣는다. 모델이 입력 속 지시를 따르거나 후보를 새로 만들어도 서버가 준 후보 ID 밖의 항목은 버리고 `anomalies`에 남긴다.
- `reason`은 한국어 1~2문장이고 화면에는 `score`를 노출하지 않는다.

### 출력 예산과 잘린 응답

**2026-09-20 실연결에서 후보 5명 배치가 `max_output_tokens=1400`에서 `finish_reason="length"`에 걸려 배치 전체가 `INVALID_JSON`이 되는 것을 확인했다.** (실호출·확인은 검증 담당이 수행했다.) 두 가지를 고쳤다.

1. 기본 상한을 `4096`으로 올리고 설정으로 조절한다. `4096`은 위 관찰에서 고른 값이며 측정으로 정한 최적값이 아니다.
2. 배치 크기를 예산에 맞춰 줄인다. `(AI_MAX_OUTPUT_TOKENS - AI_OUTPUT_TOKENS_OVERHEAD) // AI_OUTPUT_TOKENS_PER_CANDIDATE`가 실제 배치 크기의 상한이 되며, 줄어들면 `anomalies`에 `batch_size_reduced:<n>`을 남긴다. 기본값에서는 9명까지 허용되므로 기본 배치 5는 그대로다.

게이트웨이는 응답 내용을 보기 **전에** `choices[0].finish_reason`을 확인한다. `length`(또는 `max_tokens`)면 잘린 JSON을 파싱하지 않고 그 배치를 `FAILED` + `OUTPUT_TRUNCATED`로 돌려준다. 잘린 출력의 앞부분만 읽으면 일부 후보만 담긴 결과가 성공처럼 보이고, 잘려 나간 후보는 조용히 사라진다. `INVALID_JSON`과 코드를 나눈 이유는 대응이 다르기 때문이다. 잘림은 예산·배치 크기 문제이고 프롬프트 문제가 아니다.

후보 1명당 필요한 토큰과 적절한 상한은 아직 측정하지 않았다.

### 근거 검증

모델이 낸 `evidence` 인용은 주장일 뿐이므로, 각 인용을 그 인용이 가리키는 **원문 필드**에서 직접 찾아 `GroundingExcerpt.verified`를 채운다. 공백만 정규화하고 대소문자를 맞추며, 바꿔 쓴 표현은 검증되지 않는다. 모델의 자기 점수나 자기 확신은 정확성 근거로 쓰지 않는다. 캐시에서 읽은 항목도 저장된 `verified` 값을 믿지 않고 현재 원문으로 다시 검증한다.

`AI_MIN_EXCERPT_CHARS`(기본 6)보다 실질 글자 수가 적은 인용은 검증하지 않는다. `"."`는 거의 모든 프로필의 부분 문자열이라 그대로 두면 문장부호 하나가 알림 조건을 전부 통과시킨다. 실질 글자 수는 공백과 문장부호를 뺀 수다.

**검증된 인용이 하나도 없으면 추천으로 내보내지 않는다.** 그 후보는 목록에 그대로 남지만 `FAILED` + `UNGROUNDED_REASON`이 되고 `score`와 `reason`은 비운다. 모델이 근거를 대지 못한 것은 **제공자 쪽 실패**이므로 사용자의 입력이 부족하다는 `INSUFFICIENT_EVIDENCE`로 바꿔 쓰지 않는다. 모델이 주장한 인용은 전부 `verified=False`로 남겨 두어 나중에 확인할 수 있게 한다.

일부만 검증된 경우에는 이유를 유지하되(`anomalies`에 `unverified_excerpt:<id>`) 알림 적합으로는 표시하지 않는다. 검증되지 않은 인용이 이유의 결정적인 부분을 떠받치고 있을 수 있고, 나머지 인용이 그것을 보증하지는 않기 때문이다.

### 검증이 보장하는 것과 보장하지 않는 것

| 보장한다 | 보장하지 않는다 |
| --- | --- |
| `verified=True`인 인용은 그 `source`가 가리키는 원문 필드에 공백·대소문자 차이를 빼고 **그대로** 들어 있다 | 그 인용이 `reason`을 실제로 뒷받침하는지 (문자열 대조일 뿐 의미 판단이 아니다) |
| 인용은 실질 글자 수 하한을 넘는다 | 인용이 문맥상 적절한 부분인지, 부정문에서 떼어 온 것은 아닌지 |
| 적어도 하나의 인용이 검증돼야 이유가 노출된다 | `reason` 문장 전체가 원문에서 따라 나온다는 것 |
| 화면에 원문 근거로 쓸 수 있는 것은 `verified_excerpts`뿐이다 | 모델의 해석·점수가 옳다는 것 |

### 긴 입력

`AI_MAX_FIELD_CHARS`를 넘는 자기소개·교류 의도는 **자르지 않는다.** 글자 수 제한 뒤에 있던 부정이나 단서("…를 찾는 것이 **아닙니다**")가 잘려 나가면 없는 긍정 추천이 만들어진다. 대신 해당 후보만 `FAILED` + `INPUT_TOO_LONG`으로 돌려주고, 조회자 입력이 길면 모든 후보를 같은 코드로 실패시킨다. 지원 범위 안의 긴 한국어 입력은 그대로 전달한다. 상한을 올릴지 입력 단계에서 막을지는 API·프론트와 함께 정할 사항이다.

## 캐시

- 캐시 단위는 **방향이 있는 한 쌍**(조회자 → 후보)이다. BLE 재관측이나 주변 후보 구성 변화로 다시 호출하지 않는다.
- 키에 들어가는 것: 조회자·후보 `user_id`, **양쪽 입력 버전**, **양쪽 입력 텍스트 해시**, 방향, 그리고 모델·기준 URL·프롬프트 다이제스트·정책 버전·추론 설정(`temperature`, `max_output_tokens`, `max_field_chars`, `batch_size`)을 묶은 `inference_digest`.
- 버전을 올리지 않고 텍스트만 바뀐 경우도 해시 때문에 적중하지 않는다.
- **BLE 임시 식별자와 그 회전은 키에 넣지 않는다.** 광고를 식별할 뿐 사람을 식별하지 않으므로, 넣으면 같은 사람을 매번 새로 평가하게 된다.
- **알림 임계값은 캐시 식별에 넣지 않는다.** 임계값은 평가 자체를 바꾸지 않으며, 적합 여부는 캐시 적중 시에도 현재 정책으로 다시 계산한다. 평가의 의미가 바뀌면 `AI_POLICY_VERSION`을 올린다.
- `FAILED`는 저장하지 않는다. 일시적 장애를 캐시에 고정하면 복구된 게이트웨이를 가린다.
- Redis 장애는 캐시 미스로 낮춰 처리하고 추천 실패로 만들지 않는다. LLM 호출은 Redis 원자 처리 안에 들어가지 않는다.
- **저장된 값은 믿지 않는다.** 적중한 항목도 재사용 전에 다시 확인한다. 인용은 현재 원문으로 다시 검증하고, 입력 버전은 현재 요청 값으로 다시 찍고, `rank`·`notification_eligible`은 버리고 다시 계산한다. 저장된 항목의 입력 버전이 현재와 다르면(키가 버전을 포함하므로 손상·변조를 뜻한다) `anomalies`에 `cache_entry_revision_mismatch:<id>`를 남긴다. 다시 검증해서 근거가 하나도 남지 않으면 `UNGROUNDED_REASON` 실패가 된다.
- 캐시 읽기도 요청 전체 상한(`AI_TOTAL_TIMEOUT_SECONDS`) 안에서 일어난다. 느린 캐시는 느린 게이트웨이와 똑같이 호출자의 시간을 쓴다.
- **캐시 적중은 권한이 아니다.** 위의 '서버가 반드시 다시 해야 하는 일'은 그대로 수행한다.

## 알림 적합성 정책

`notification_eligible = True` 조건은 전부 만족해야 한다.

1. `status`가 `EVALUATED`일 것 (`INSUFFICIENT_EVIDENCE`·`FAILED`·`PENDING`은 제외)
2. `intent_conflict`가 `False`일 것
3. `score >= AI_NOTIFICATION_SCORE_THRESHOLD`
4. 이유가 비어 있지 않을 것
5. 검증되지 않은 인용이 **하나도 없을** 것
6. 조회자 쪽과 후보 쪽에서 각각 **검증된** 인용이 있을 것
7. 양쪽 **교류 의도**에서 각각 검증된 인용이 있을 것

**순위 1위라는 사실만으로는 적합하지 않다.** 주변 후보가 모두 약해도 1위는 항상 생기기 때문이다. 7번 때문에 교류 의도를 비워 둔 참가자는 기본 설정에서 알림 대상이 되지 않는다. 이는 AI-D4의 '신중한 알림' 방향을 따른 의도된 동작이며, 그 참가자는 목록에는 그대로 남고 바로 채팅할 수 있다. 양쪽 이득이 같아야 한다는 조건은 아니다.

> **`0.72`는 보정되지 않은 값이다.** 실제 모델 평가 전에 고른 보수적 자리표시자이고, 모델이 바뀌면 같은 숫자가 같은 알림 품질을 뜻하지 않는다. 오탐·누락 비교로 정하기 전까지 확정값으로 기록하지 않는다. 이 값은 후보를 목록에서 제거하는 기준이 아니다.

## 실패 처리

| 상황 | 결과 |
| --- | --- |
| `AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL` 누락 | 호출 없이 전 후보 `FAILED` + `CONFIGURATION_MISSING`. 누락된 **이름만** 경고 로그에 남긴다 |
| 입력 길이 초과 | 해당 후보(또는 조회자면 전 후보) `FAILED` + `INPUT_TOO_LONG` |
| HTTP 4xx/5xx | 그 배치 `FAILED` + `GATEWAY_HTTP_ERROR`. 응답 본문은 키를 되비출 수 있어 상태 코드만 남긴다 |
| 연결 실패 | 그 배치 `FAILED` + `GATEWAY_NETWORK_ERROR` |
| 개별 요청 timeout / 전체 timeout | 해당 배치 또는 남은 배치 `FAILED` + `GATEWAY_TIMEOUT`, `anomalies`에 `total_timeout` |
| 응답 잘림(`finish_reason="length"`) | 그 배치 `FAILED` + `OUTPUT_TRUNCATED`, `anomalies`에 `output_truncated:<n>`. 잘린 내용은 파싱하지 않는다 |
| JSON 아님 | 그 배치 `FAILED` + `INVALID_JSON` |
| `recommendations` 배열 없음, 알 수 없는 `status`, 점수·이유 누락, 범위 밖 점수, 타입 불일치 | 해당 항목 `FAILED` + `SCHEMA_MISMATCH` |
| 같은 후보 ID 중복 응답 | 그 후보만 `FAILED` + `DUPLICATE_IN_RESPONSE` (나머지 후보는 유지) |
| 응답에 빠진 후보 | `FAILED` + `MISSING_IN_RESPONSE` |
| 형식이 깨졌지만 `candidate_id`는 읽을 수 있는 항목 | 그 후보 `FAILED` + `SCHEMA_MISMATCH` (`MISSING_IN_RESPONSE`로 돌리지 않는다) |
| 검증된 인용 없는 평가 | `FAILED` + `UNGROUNDED_REASON`, `score`·`reason` 비움 |
| 캐시 읽기·쓰기 실패 | 추천 실패가 아니라 캐시 미스. `anomalies`에 `cache_read_failed:` / `cache_write_failed:` |
| 서버가 주지 않은 후보 ID | 버리고 `anomalies`에 `unknown_candidate_id:<id>` |

부분 실패는 부분 실패로 남는다. 한 배치가 실패해도 성공한 배치의 결과는 그대로 쓴다. 어떤 실패에서도 추천을 지어내지 않고, 받은 후보 ID는 전부 결과에 남는다.

`score`·`intent_conflict`·`candidate_id`·`status`는 엄격한 타입으로 읽는다. `"0.95"`나 `"false"` 같은 문자열이 확신 있는 점수나 해제된 의도 충돌로 바뀌지 않는다.

게이트웨이 실패는 **예외 타입과 `status_code`로** 구분하며 예외 메시지 문자열을 읽지 않는다. 클래스 이름에 `HTTP`가 들어간 전송 오류(`httpx.HTTPStatusError` 등)를 응답 오류로 착각하지 않기 위해서다.

`RecommendationResult.gateway_calls`는 **재시도와 실패를 포함해 이 요청이 제공자에게 실제로 보낸 요청 수**다. 계수는 `recommend()` 호출 하나에 묶인다(`contextvars`). 서비스와 HTTPX 클라이언트를 여러 요청이 공유하고 동시에 실행돼도 서로의 호출을 세지 않으며, 그렇게 만들려고 요청을 직렬화하지도 않는다. 게이트웨이의 `attempts` 속성은 프로세스 수명 동안의 누적값이라 요청별 계산에 쓰지 않는다. 직접 만든 게이트웨이가 이 계수에 참여하려면 `reports_attempts = True`를 두고 요청 직전에 `app.ai.gateway.record_attempt()`를 호출한다. 참여하지 않으면 배치 수로 대체하며 그 값은 재시도를 세지 못한다.

## 토큰 사용량 (`RecommendationResult.usage`)

`TokenUsage`는 **이 `recommend()` 호출 하나가** 제공자에게서 보고받은 토큰 수다. `gateway_calls`와 같은 요청 범위(`contextvars`)에서 모이므로 서비스·HTTPX 클라이언트를 공유하는 동시 요청끼리 섞이지 않는다.

| 필드 | 뜻 |
| --- | --- |
| `input_tokens` | 보고받은 입력·프롬프트 토큰 합. 제공자가 `prompt_tokens` 또는 `input_tokens`로 보낸 값 |
| `output_tokens` | 보고받은 출력·완료 토큰 합 (`completion_tokens` 또는 `output_tokens`) |
| `total_tokens` | 보고받은 `total_tokens` 합. 직접 더해서 만들지 않는다 |
| `complete` | 이 호출의 **모든 제공자 요청이 usage를 보냈고 세 값이 모두 알려진** 경우에만 `true`. 값이 0이라는 뜻이 아니다 |
| `reported_calls` | usage를 보낸 제공자 요청 수 |
| `provider_calls` | 이 호출이 실제로 보낸 제공자 요청 수 (`gateway_calls`와 같다) |

읽는 규칙

- **`0`은 측정값이고 `None`은 측정이 없다는 뜻이다.** 둘을 같게 다루지 않는다.
- `0`이 나오는 경우는 두 가지다. 제공자가 실제로 0을 보고했거나, 제공자 요청 자체가 없었던 경우(전부 캐시 적중, 설정 누락, 입력 길이 초과)다. 후자는 `provider_calls == 0`이고 `complete`는 `true`다(보내지 않았으므로 0이 곧 측정값이다). 두 경우는 `provider_calls`로 구분한다.
- **보고되지 않은 값은 `None`으로 남긴다.** 호출은 했는데 usage가 오지 않거나 일부 필드만 온 경우이며, 빠진 필드를 0으로 채우지 않는다.
- **`complete=false`여도 값이 있을 수 있다.** 일부 배치만 usage를 보냈거나 세 값 중 일부만 온 경우다. 어떤 값이 있는지는 플래그가 아니라 필드를 직접 본다. 부분 합계를 전체 사용량으로 기록하지 않는다.
- **잘린 응답도 사용량을 보고한다.** `finish_reason="length"`로 실패한 배치도 토큰을 썼으므로 usage를 먼저 기록한 뒤 실패로 처리한다.
- 정수가 아니거나 음수인 값(`"100"`, `true`, `-5`)은 무시하고 `None`으로 남긴다.
- **금액은 계산하지 않는다.** 이 값은 제공자가 보고한 토큰 수일 뿐이며 단가·비용 추정은 이 모듈이 하지 않는다. 게이트웨이의 가격 조회는 검증 담당 기록에 따르면 인증되지 않았다.
- usage 객체에서 읽는 것은 위 세 정수뿐이다. 제공자 응답의 다른 내용은 저장하거나 노출하지 않는다.

직접 만든 게이트웨이가 참여하려면 요청 직전에 `app.ai.gateway.record_attempt()`를, 응답 본문을 받은 뒤 `record_usage(body.get("usage"))`를 호출한다.

## 정렬

1. 상태: `EVALUATED` → `INSUFFICIENT_EVIDENCE` → `PENDING` → `FAILED`
2. 같은 상태 안에서는 `score` 내림차순
3. 동점이면 **서버가 후보를 넘겨준 순서**

같은 입력이면 항상 같은 순서가 나온다. `rank`는 이 순서의 0부터 시작하는 색인이며, 낮은 점수나 실패로 후보를 빼지 않는다.

## 시작과 정리, 취소

- `RecommendationService`는 HTTPX 클라이언트를 첫 호출에서 만들고 재사용한다. 요청마다 새 서비스를 만들지 않는다.
- 종료 시 `await service.aclose()`를 호출한다. 주입한 게이트웨이는 주입한 쪽이 닫고, 서비스가 만든 게이트웨이만 서비스가 닫는다.
- `recommend()`를 취소하면 진행 중인 배치 작업을 모두 취소하고 정리한 뒤 `CancelledError`를 그대로 올린다. 작업을 남기지 않는다.
- 전체 상한은 소켓 단위가 아니라 요청 단위다. 동시성 제한 때문에 대기하던 배치도, 캐시 읽기도 `AI_TOTAL_TIMEOUT_SECONDS` 안에 끝난다. 상한을 넘겨 평가하지 못한 후보는 `FAILED` + `GATEWAY_TIMEOUT`으로 남는다.

## 프롬프트 관리

기본 프롬프트는 `app/ai/prompt.py`의 `SYSTEM_INSTRUCTIONS`에 있고 저장소 안에서 버전 관리된다. `DefaultPromptProvider`는 `name`·`version`·본문으로 `digest`를 만들고, 그 다이제스트가 `RecommendationResult.prompt_digest`와 캐시 식별에 들어간다. 프롬프트를 바꾸면 캐시가 자동으로 분리된다.

`PromptProvider` 프로토콜을 구현해 주입하면 프롬프트를 통째로 교체할 수 있다. **이것은 구현 기본값이자 교체 지점일 뿐, 프롬프트 관리 제품을 채택한 것이 아니다.** 원격 프롬프트 서비스는 호출하지 않는다. 관리 방식은 사용자가 정한다(AI-D6).

## 프롬프트 버전

| 항목 | 값 |
| --- | --- |
| `DefaultPromptProvider.name` | `bside-recommendation` |
| `DefaultPromptProvider.version` | `2026-09-20.2` |
| `prompt_digest` | `32db67109c375cf1` |
| 기본 설정의 `inference_digest` | `5c0a59ef8b4edef1` (`AI_MODEL` 등 설정이 바뀌면 달라진다) |

`2026-09-20.2`에서 실모델 평가의 E05·E03 관찰을 반영해 두 가지를 좁게 고쳤다. 기존 규칙은 그대로 두었고 사례의 이름·문장에 맞춘 조건은 넣지 않았다.

1. **구체적이지 않은 입력과 낮은 적합성을 구분한다.** 분야·하는 일·상황·원하는 상대 조건 중 어느 것도 읽어낼 수 없으면(인사말뿐, 대상을 좁히지 않는 표현, 범위 없이 여러 가지를 한다는 표현) 한쪽만 그렇더라도 `insufficient_evidence`다. 낮은 점수는 양쪽 다 구체적인데 맞지 않는다고 판단한 결과로 한정한다. 모호한 입력에서 관심사·경험·의도를 추측해 채우지 않는다.
2. **이유에는 따옴표를 쓰지 않는 것을 기본으로 한다.** 원문 내용은 따옴표 없이 풀어 쓰고, 따옴표는 글자가 완전히 같을 때만 허용한다. 요약을 따옴표로 감싸 인용처럼 보이게 하던 출력을 막기 위한 것이다. `evidence`의 `quote`는 반대로 원문 그대로여야 하고 의미를 알아볼 수 있을 만큼 길어야 한다.

프롬프트를 바꾸면 `prompt_digest`가 바뀌고 캐시가 자동으로 분리된다. 평가 결과를 기록할 때 이 다이제스트를 함께 남긴다.

## 검증 현황

`uv run pytest`로 `server/tests/test_ai.py`의 84개 테스트가 통과한다(저장소 전체 231개). 모두 `httpx.MockTransport` 또는 스텁 게이트웨이를 쓰며 **실제 모델을 호출하지 않는다.** 다루는 범위는 E01~E08 대응 동작, 부분 실패, 잘못된 모델 출력, 잘린 출력, 캐시 식별·재검증·임계값 변경, 취소·정리·요청 상한, 후보 ID 전수 보존, 긴 입력, 근거 검증, 결정론적 정렬, Redis 어댑터다.

리뷰 담당의 `server/tests/test_ai_review.py`에 기록된 R1~R8과 후속 R7b(동시 요청 시 `gateway_calls` 교차 오염)를 모두 고쳤다. 같은 내용을 `tests/test_ai.py`에도 회귀 테스트로 남겼다. R7b에는 동시 요청·동시 재시도·취소 상황의 회귀 테스트를 추가했다.

## 한계 (아직 확인하지 않은 것)

**실모델 결과는 이 문서가 아니라 [AI 추천 검증 기록](ai-validation.md)에 있다.** 게이트웨이 조사·모델 목록·실호출 평가·모델 비교는 검증 담당이 소유하며 지금도 진행 중이다. 구현 담당인 나는 실모델을 호출하지 않으므로, 아래의 '확인하지 않았다'는 **이 문서와 `tests/test_ai.py`의 범위**를 뜻하고 검증 담당의 실행 결과를 부정하지 않는다. 어떤 주장을 근거로 쓸 때는 `ai-validation.md`의 실행 기록과 거기에 적힌 모델·프롬프트 다이제스트·설정을 함께 인용한다.

- 이 모듈의 테스트는 전부 모의 게이트웨이다. **`tests/test_ai.py` 통과는 추천 품질의 증거가 아니다.**
- 단순 규칙 기준선 대비 우위, 사람이 검토·확정한 정답과의 일치, 모델 선택은 확정되지 않았다. 검증 담당의 기대값은 모델 출력을 보기 전에 쓴 가설이며 사람 검토 전이다.
- 코드의 `AI_MODEL` 기본값은 여전히 없다. 로컬 `.env`에 `claude-haiku-4-5`를 설정했을 뿐이며, 이 모델이 다른 모델보다 낫다는 검증은 [검증 기록](ai-validation.md)의 실행 결과로만 주장한다.
- 후보 20명 5초 이내 목표를 이 문서 범위에서 측정하지 않았다. `duration_ms`는 측정을 돕는 값일 뿐 달성 기록이 아니다.
- 알림 임계값 `0.72`의 오탐·누락은 보정되지 않았다. 배치 크기가 절대 점수에 주는 영향, 후보 1명당 필요한 출력 토큰, 재시도(`AI_MAX_ATTEMPTS`)의 이득도 측정하지 않았다.
- 긴 한국어 입력에서의 실제 화면 가독성, API 라우터·Android 통합, Redis 캐시의 운영 동작을 확인하지 않았다. 이 모듈은 아직 `app.main`에 연결되어 있지 않다.
