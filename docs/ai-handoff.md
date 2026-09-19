# AI 개발 인계 — 컨텍스트 압축 후 재개용

2026-09-20. 컨텍스트 압축을 위해 기존 작업을 기록했다. **AI 모듈·평가 도구 구현은 완료했다.** 이후 사용자가 기존 작업의 구조적 커밋·푸시와 Grok 4.6·Sonnet 5 추가 실모델 평가를 요청했다. 아래 구현·검증 수치는 추가 평가 전의 기준 기록이다. 추가 평가 전에 이번 작업의 Claude 세 세션을 모두 compact했고, 이후 사용자가 지정한 Codex Astra low 작업자로 이전했다.

## 세션 복구 — 2026-09-20

직전 상위 세션 `01a0baea-41fc-7222-9f3e-ad2582b5f87a`가 열리지 않아 사용자 요청으로 새 세션 `01a0bafb-43d3-7371-bf32-392e9371a167`에서 대화 원본·사용자 지시·작업 트리를 대조해 재개했다. 기존 커밋·푸시는 완료됐으며 원격 `feat/ble-ai-recommendation`의 `3eec87e`를 직접 확인했다.

복구 시 저장된 결과는 두 모델의 기본 E01/E02 4건과 제한 시간을 늘린 E01 진단 2건이었다. 호출 장부는 누적 **129회**(기존 117 + 추가 12), 미완료 호출 표식은 없었다. 진단은 Grok 4.6이 약 23.7초에 1명 평가·5명 출력 잘림, Sonnet 5가 약 22.1초에 6명 평가였으며 기본 20초 조건의 결과와 합치지 않는다.

기존 herdr 평가 작업자 `ai-eval-astra-low`와 독립 리뷰 작업자 `ai-review-astra-low`를 그대로 재개했다. 평가 작업자는 이전 사용 한도 오류 이후 새 지시에서 실제 실행 가능함을 확인했다. 저장된 응답·진단은 재사용하고, 누적 운영 상한 240회와 동결 설정을 유지해 나머지 평가·벤치마크·보고서를 완료했다. 복구 시점의 비교 요약 JSON은 누적 125회만 반영한 중간 산출물이었고, 아래 최종 결과로 갱신했다.

### 추가 평가 완료

- [추가 모델 비교 보고서](../server/docs/ai-model-comparison.md)와 [기계 판독 요약](../server/evals/reports/model-comparison-2026-09-20.json)에 최종 결과를 남겼다. 기본 18사례 × 2모델, 별도 E01 진단 × 2모델, 후보 20명 cold/warm 3쌍 × 2모델을 완료했다.
- 공통 7사례 적용 검사: **Haiku 59/60, DeepSeek 55/60, Grok 43/60, Sonnet 46/60**. 새 모델의 실제 17사례 후보 77명 중 Grok은 평가 1명·근거 부족 8명·실패 68명, Sonnet은 평가 19명·근거 부족 16명·실패 42명이었다. 독립 리뷰가 저장된 응답으로 품질 수치를 재계산해 일치를 확인했다.
- 20명 cold 중앙값은 Grok **20.059초**, Sonnet **20.049초**다. Grok은 3회 모두 20명 timeout, Sonnet은 2회 전원 timeout·1회 평가 3명/근거 부족 2명/timeout 15명이었다. warm에도 각각 12회·11회 생성 호출이 있어 순수 캐시 성능이 아니다. **5초 목표는 여전히 미달**이다.
- 생성 호출은 추가 **91회**, 누적 **208/240회**로 종료했다. 추가 91회는 품질·진단 44회와 벤치마크 47회다. mock E08은 생성 호출 장부에서 제외했다. 사용량 미보고·부분 보고는 요약의 `complete` 플래그로 표시하며 금액 단가는 여전히 미확인이다.
- 이번 게이트웨이·고정 설정에서는 기존 **Haiku 유지**를 권고한다. 기본 모델·프롬프트·기대값은 변경하지 않았다. 실행 시점과 게이트웨이 부하를 통제한 비교는 아니며, H/N도 새로운 보류 사례가 아니다.
- 오프라인 평가 도구 검사와 예외 시 주입 gateway 종료 검증이 통과했다. 기존 앱의 231개 테스트는 앞선 완료 기록이며 이번 실행에서 다시 실행한 수치가 아니다.
- 독립 리뷰의 최종 대조도 통과했다. 벤치마크 원본 12개 phase·요약·문서의 수치와 장부가 일치하며, 계획된 진단 외 중복 호출이나 미완료 표식은 없다. 벤치마크 12개 phase 모두 토큰 보고가 불완전하다(`complete=false`).

복구 직후 기존 작업의 원격 HEAD는 `3eec87e`였다. 이후 사용자가 **Haiku 유지와 PR 생성**을 요청했다. 추가 평가·세션 복구 산출물도 PR에 포함하며, 최신 `main`의 API·Android 구현을 통합해 검증한다. 별도 사용자 스킬 변경은 그대로 보존한다. 추가 모델 평가 요청은 완료됐으며 별도 요청 없이 유료 평가를 다시 실행하지 않는다.

### 최신 main 통합과 PR 검증

`origin/main`의 `a85292f`(API v0.1, Android 실기기 T07 기록, Capacitor CORS 수정)를 통합했다. API 계약·서버 README 충돌은 최신 엔드포인트·공개 스키마를 보존하고 독립 AI 모듈 경계를 추가해 해결했다. 루트 README의 API·Android 미구현 설명도 갱신했다.

PR 준비 중 추가된 `main`의 `05afb68`도 통합했다. 서버 배포 기록과 Compose의 `restart: unless-stopped`·`REDIS_PORT` 설정을 그대로 보존했다. 공개 HTTPS 서버 배포는 기존 팀 작업이며 이번 PR에서 배포한 것은 아니다. 추가된 두 파일은 앱 코드 변경이 없어 앞선 서버 테스트를 반복하지 않았다.

API·웹·Android 제품 코드와 OpenAPI는 `main`과 동일하다. 관측 응답은 여전히 `recommendation.status: unavailable`이다. 서버에 내부 프로필·발견 참여 버전 관리가 없으므로 AI 입력 스냅샷·완료 후 재검사·공개 응답 어댑터·추천 알림은 후속 작업이다. 배포에서도 `AI_MODEL=claude-haiku-4-5`를 명시한다.

`server/tests/conftest.py`의 Redis 초기화는 API용 `client` fixture만 의존하도록 조정했다. Astra low 검증 담당이 별도 임시 Redis 7.0.15로 전체 **261 passed·0 skipped**, Redis 없이 **232 passed·29 skipped(API만)**, AI 테스트만 **227 passed·0 skipped**를 확인했다. 평가 JS·gateway 종료 검사도 통과했다. 임시 Redis는 종료했고 유료 모델 호출은 추가하지 않았다. 이전 231개는 통합 전 서버 테스트 전체 개수다.

## 사용자 지시와 확정 사항

- **현재 분담: 상위 Codex는 계획·오케스트레이션, herdr의 Codex Astra low 작업자가 코드 작성·검증을 담당한다.** Claude 사용 한도 이후 사용자가 Codex 이전과 개발 모델 Astra low를 명시했다. low 작업자에게 실행 순서·제약·완료 기준을 상세히 전달한다.
- 초기 구현·검증은 herdr의 새 탭에서 `claude-vanilla --dangerously-skip-permissions --effort high --name ...`로 수행했다. 이전 후에는 `codex-vanilla -m gpt-6-astra -c model_reasoning_effort="low"`를 명시해 새 탭에서 실행한다.
- API와 프론트는 다른 팀원이 각각 개발 중이다. AI 모듈·인계 경계를 지키며 다른 팀원의 파일이나 변경을 되돌리지 않는다.
- 사용자가 `server/.env`에 `AI_API_KEY`를 설정했다. 키를 출력·문서화·커밋하지 않는다.
- 추가 비교 후 사용자가 **Haiku(`claude-haiku-4-5`)로 진행**하기로 확정했다. 로컬 `AI_MODEL`은 이미 이 값이며, 코드에서는 명시적 환경 설정을 계속 요구한다.
- **교체 가능한 기본 프롬프트를 포함하고, 이후 사용자가 직접 관리한다.** 외부 프롬프트 관리 제품을 도입한 것은 아니다.
- 모델 결과를 보기 전에 사용자가 승인한 핵심 기대값: 같은 React 경험자가 배포 도움을 원하면 **민서**, 장기 사이드프로젝트 동료를 원하면 **영진·도윤**을 우선한다. 영진·도윤 사이의 순서, 다른 사례·세부 조건까지 승인받은 것은 아니다.

## 먼저 읽을 문서

| 문서 | 용도 |
| --- | --- |
| [개발 계획·완료 기록](ai-development-plan.md) | 작업 경계와 결정 |
| [AI 연동 가이드](../server/docs/ai.md) | 공개 인터페이스·설정·서버 책임 |
| [실모델 검증 기록](../server/docs/ai-validation.md) | 모델 비교·프롬프트 버전·실측·한계 |
| [독립 리뷰](../server/docs/ai-review.md) | 17건 재현·수정·최종 미해결 0건 |
| [평가 실행 안내](../server/evals/README.md) | Promptfoo·저장 응답 재채점·벤치마크 |

제품 원본은 `spec/prompts.md`, `docs/api-contract.md`의 AI 모듈 경계, `docs/planning.md` AI-D1~D6, `docs/validation.md` E01~E08이다. `docs/history/`의 행사 방·요청/수락 모델을 현재 계약으로 사용하지 않는다.

## 구현 상태

`server/app/ai/`에 독립 Python 모듈을 구현했다. HTTPX 비동기 OpenAI 호환 게이트웨이, Pydantic 입력·출력, 양쪽 의도 추천, 원문 인용 검증, 부분 실패·후보 보존, 방향별 캐시, 알림 적합성 정책, 입력 버전 확인, 요청별 호출·토큰 사용량을 제공한다.

- `ParticipantProfile`: `user_id`, `self_description`, `connection_intent`, `profile_revision`.
- `RecommendationRequest`: 조회자와 서버가 허용한 후보의 불변 스냅샷.
- `RecommendationService.recommend(request)`: 모든 후보를 포함하는 평가 결과 반환.
- `pending_result(request)`: 모델 호출 없이 전체 후보의 미평가 결과를 즉시 구성.
- `matches_current_inputs()` / `stale_candidate_ids()`: **새로 읽은 현재 입력**과 결과 비교. 원래 요청을 다시 비교하는 것으로 수정 경합을 막았다고 주장하지 않는다.
- 상태: `EVALUATED`, `INSUFFICIENT_EVIDENCE`, `FAILED`, `PENDING`. 실패와 정보 부족을 낮은 점수·성공으로 꾸미지 않는다.
- 낮은 평가·실패라도 후보를 지우지 않는다. 숫자 점수는 내부용이다.
- 캐시: `InMemoryRecommendationCache`, `RedisRecommendationCache`, `NullRecommendationCache`. 쌍·방향·양쪽 버전/내용·모델·프롬프트·추론 설정을 식별에 반영한다. 임계값 변경은 캐시 적중에도 현재 정책을 다시 적용한다.
- 인용 검증은 원문 포함 여부를 확인하는 제한된 검사다. 모든 추천 이유의 의미적 정확성을 증명하지 않는다.
- `RecommendationResult.usage: TokenUsage`: 입력·출력·전체 토큰, `complete`, `reported_calls`, `provider_calls`. 미보고는 `None`, 일부 보고 합계는 `complete=False`; 동시 요청의 사용량을 섞지 않는다.

API 라우터·`app/main.py`·프론트는 수정하지 않았다. 서버는 결과 노출·알림 직전에 현재 입력, 별도로 보유한 발견 참여 버전·상태, 근접 관측과 중복 알림 조건을 재검사해야 한다. `notification_eligible`은 권한 검사가 아니다. 주입한 게이트웨이의 정리는 주입자가 책임진다.

## 선택 설정과 실측

- 게이트웨이: `https://ai.cs.kookmin.ac.kr/v1`.
- 선택 모델: **`claude-haiku-4-5`**. 비교 모델: `deepseek-v3.2`.
- 로컬 `server/.env`에 기존 키를 보존하면서 `AI_BASE_URL`, `AI_MODEL`을 추가했다. `.env`는 Git 제외 대상이다.
- 기본 프롬프트: `2026-09-20.2`, digest **`32db67109c375cf1`**. 본문·교체 지점은 `server/app/ai/prompt.py`.
- 권장 설정: 배치 **5**, 동시 호출 **4**, 출력 토큰 상한 **4096**, 알림 임계값 **0.72**. 임계값은 실사용 보정 완료값이 아니다.
- 초기 1400토큰 상한에서는 5명 배치가 잘렸다. 상한을 늘리고 `finish_reason`에 따른 `OUTPUT_TRUNCATED` 분류를 추가했다.
- 최종 프롬프트·권장 설정·후보 20명: 첫 평가 3회 **8.852~11.023초, 중앙 8.878초**, 매번 20명 `EVALUATED`, 실패 0건.
- 같은 프로세스 인메모리 캐시 재사용 중앙 약 **0.8ms**. Redis·HTTP·Android 전체 성능 수치가 아니다.
- 배치 2·동시 10의 단일 실험: **5.649초**, 평가 17명·근거 부족 3명, 오류 0건, 전체 후보 20명 유지. 토큰 증가와 판정 변화 때문에 기본 설정으로 채택하지 않았다.
- **초기 5초 목표는 미달이다.** 보장하거나 완료로 표현하지 않는다.
- 권장 설정의 20명당 제공자 보고 사용량: 입력 **11,105**, 출력 **6,205~6,369**, 전체 **17,310~17,474** 토큰. 실제 금액은 가격 조회 권한이 없어 미확인이다.

## 검증 결과와 해석

- Claude 최종 실행: `cd server` 후 `uv run --frozen pytest -q` → **231 passed**, 실패·xfail 없음.
- 수용 테스트 `test_ai_acceptance.py` **112개**, 독립 리뷰 `test_ai_review.py` **31개** 포함.
- 독립 리뷰 지적 **17건 모두 해결**: 구현 10건(R1~R8, R7b, R9), 평가 도구 7건(V1~V7).
- 고정 프롬프트 대상 7사례의 해당 검사: **Haiku 59/60**, **DeepSeek 55/60**, 문자열 기준선 53/60. 둘 다 사용자 확인 E01/E02 우선순위에 맞았다. 이것을 광범위한 정확도나 실사용 성과로 일반화하지 않는다.
- 오프라인 Promptfoo는 18사례×3제공자 **54건 중 16건 통과**다. 규칙·문자열 기준선과 테스트 대역이 품질 기대를 못 맞춘 결과를 포함한다. 54건 모두 통과했다고 쓰지 않는다. `module:scripted`는 실제 LLM이 아니다.
- E01/E02는 자기소개·후보 내용뿐 아니라 **후보 순서도 고정**한다. `shuffle_group`과 교차 사례 단언으로 의도 효과와 배치/동점 순서 효과를 분리했다.
- 평가 점수에서 적용하지 않는 검사는 제외한다. 기준선 인용 출처 버그를 고친 뒤 기준선만 재계산했고, 모델 우위로 오인하지 않았다.
- E03/E05 조정용 사례만 근거로 프롬프트를 좁게 수정했다. N01~N03은 수정 프롬프트 고정 후 새로 작성해 검증했다. **H·N 사례 모두 이제 결과를 본 사례**이므로 이후 변경 검증에는 새 보류 사례가 필요하다.
- 보수적인 양쪽 의도 근거 조건 때문에 좋은 상대를 놓친 N02 사례가 있다. 이를 숨기거나 통과를 위해 조건을 완화하지 않았다.
- 실제 생성 요청 **117회**를 기록했다. 150회는 이번 세션에서 둔 실행 상한이지 사용자 예산 약속이 아니다. 새 평가를 불필요하게 재실행하지 않는다.

## 산출물과 Git 상태

최초 인계 기록 시점 브랜치: **`feat/ble-ai-recommendation`**, HEAD **`c11fc66`**. 당시 변경은 미커밋이었다. 이후 사용자가 커밋·푸시를 명시적으로 요청했으므로 최신 상태는 `git log`와 원격 브랜치로 확인한다. 배포 요청은 없다.

이번 작업의 수정 파일: `README.md`, `server/README.md`, `server/pyproject.toml`, `server/uv.lock`.
추가 경로: `docs/ai-development-plan.md`, 이 문서, `server/app/ai/`, `server/docs/ai*.md`, `server/evals/`, `server/tests/test_ai.py`, `server/tests/test_ai_acceptance.py`, `server/tests/test_ai_review.py`.

작업 시작 전부터 존재한 **별도 사용자 변경**: `skills-lock.json`, `.agents/skills/domain-modeling/`, `.agents/skills/grilling/`, `.claude/skills/`. 일괄 add/reset/정리하지 않는다.

평가 원본 `server/evals/results/`와 `node_modules/`는 Git 제외 대상이다. 인계·커밋 때 로컬 원본이 자동으로 포함된다고 가정하지 않는다. 주요 로컬 증거:

- `live-full.prompt-cb747b136ea0a9b7.json`: 초기 프롬프트 전체 비교 보존본.
- `live-targeted-prompt2.json`, `live-targeted-fresh.json`: 최종 프롬프트 대상·새 보류 사례.
- `bench-live-haiku-b5c4-prompt2.json`: 최종 권장 설정 3회 실측.
- `bench-live-haiku-b2c10.json`: 단일 성능 실험.
- `live-budget.json`: 생성 호출 장부.

단언 변경 시 저장된 응답은 `server/evals/scripts/replay.js`로 재검사한다. 유료 재생성 없이 재채점할 수 있다. 기존 결과의 부족한 토큰 기록을 복원하려고 같은 모델을 다시 호출하지 않는다.

## herdr 세션 이어가기

기록 시점 workspace **`wC`**. 아래 세 탭은 이번 작업에서 생성했고 모두 **done**이다. 실제 재개 시 상태와 ID를 다시 확인한다. 사용자 작업 탭은 건드리지 않는다.

후속 평가 착수 전에 세 탭 모두 `/compact`의 `Compacted` 완료를 확인했다. 기존 작업은 구현 `7f8c26e`, 평가·테스트 `b92656e`, 문서 `68f3409`로 구조화해 원격 브랜치에 푸시했다. 이후 평가 담당에게 두 추가 모델 실행을, 리뷰 담당에게 평가 방법 독립 검토를 지시했다.

2026-09-20 03:31 KST에 평가·리뷰 세션 모두 Claude 사용 한도에 걸렸다. 이는 평가 게이트웨이의 실패가 아니었다. 이후 사용자가 **Codex Astra low로 이전**을 지시했다. 중복 실행을 막기 위해 기존 Claude 평가·리뷰 탭의 07:40 자동 재개를 취소하고 새 Codex 탭으로 이전한다.

| 역할 | 탭 | pane | Claude 세션 이름 |
| --- | --- | --- | --- |
| 구현 | `wC:t6` / `ai-implementation` | `wC:p6` | `bside-ai-implementation` |
| 평가 | `wC:t7` / `ai-validation` | `wC:p7` | `bside-ai-validation` |
| 독립 리뷰 | `wC:t8` / `ai-review` | `wC:p8` | `bside-ai-review` |

사용자 요청으로 이전한 새 작업 탭(두 탭 모두 시작 화면에서 `gpt-6-astra low` 확인):

| 역할 | 탭 | pane | herdr 에이전트 이름 |
| --- | --- | --- | --- |
| 추가 모델 평가·도구 작성 | `wC:tA` / `ai-eval-astra-low` | `wC:pA` | `ai-eval-astra-low` |
| 독립 검토 | `wC:tB` / `ai-review-astra-low` | `wC:pB` | `ai-review-astra-low` |

기존 Claude 평가·리뷰 화면의 `Automatic continue cancelled`를 확인했다. 새 작업자는 `codex-vanilla`에 `-m gpt-6-astra -c model_reasoning_effort="low" --dangerously-bypass-approvals-and-sandbox --no-alt-screen`을 명시했다. 실제 게이트웨이 호출은 새 평가 담당 한 곳에서만 수행한다.

`HERDR_ENV=1`인지 먼저 확인한다. herdr 사용법이 새 컨텍스트에 없다면 `herdr --skill`을 읽는다. `herdr agent get <pane>`로 상태 확인, `herdr agent read <pane> --source visible`로 화면 확인, `herdr agent prompt <pane> '<지시>'`로 작업 전달한다. 작업 중에는 긴 `recent-unwrapped` 읽기가 거부될 수 있으니 `visible`을 쓴다.

Claude의 Usage/Settings 창이 열려 있을 때는 prompt 제출이 작업 시작으로 이어지지 않은 적이 있었다. 화면 확인 후 그 창만 `esc`로 닫고, 실제 working 전환을 확인한다. timeout만 보고 같은 작업을 무작정 중복 제출하지 않는다. 기다릴 때도 사용자에게 주기적으로 진행 상황을 알린다.

## 다음 작업의 경계

현재 미해결 코드 리뷰 항목은 없다. 최신 `main`에는 BLE 발견·대화·복원 경로와 실기기 두 대의 T07 검증 기록이 있다. 이 PR에서 남겨 둔 AI 통합은 내부 입력·참여 버전 관리, 공개 추천 응답·순위·이유 매핑, 실제 추천 알림과 API·Android 검증이다. 5초 목표 최적화, 더 많은 사람 검토 기대값, 알림 오탐/누락 실사용 평가, 게이트웨이 금액 확인도 후속 과제다.

재개 시 먼저 최신 `git status`와 팀원 변경을 읽는다. **기존 작업 커밋·푸시 및 Grok 4.6·Sonnet 5 추가 비교는 완료됐다.** 결과는 위 추가 평가 완료 기록과 비교 보고서를 따른다. 후속 사용자 지시는 Haiku 유지와 최신 `main`을 고려한 PR 생성이다. PR·커밋의 최신 상태는 Git과 원격 PR에서 확인한다. 제품 배포는 요청받지 않았으며 저장된 평가를 반복 호출하지 않는다.
