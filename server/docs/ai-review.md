# AI 추천 모듈 독립 리뷰 (server/app/ai, server/evals)

2026-09-20. 리뷰 담당 Claude가 구현·평가와 별개로 작성한 결함 증거 문서다.
실모델·네트워크 호출은 하지 않았다. 리뷰 담당이 쓰는 파일은 이 문서와
`server/tests/test_ai_review.py` 둘뿐이다.

## 최종 상태 — 미해결 0건

| 대상 | 제기 | 해결 | 미해결 |
| --- | --- | --- | --- |
| 구현 `server/app/ai` (R1~R8) | 8 | **8** | 0 |
| 구현 동시성 (R7b) | 1 | **1** | 0 |
| 구현 토큰 사용량 (R9) | 1 | **1** | 0 |
| 평가 하네스 `server/evals` (V1~V7) | 7 | **7** | 0 |
| **합계** | **17** | **17** | **0** |

```
cd server
uv run --frozen pytest tests/test_ai_review.py -q   →  31 passed
uv run --frozen pytest -q                           →  231 passed
```

**`xfail`로 가려 둔 결함이 없다.** 모든 지적은 제기 당시 실패하거나 `xfail`이었고,
각각 독립 재현으로 수정을 확인한 뒤 표식 없는 통과 테스트로 바꿨다. 회귀가 생기면
예상된 실패로 흡수되지 않고 그대로 실패한다.

## 해결 확인 — R9 (필드별 사용량 집계, 닫음)

`RequestMetrics`에 필드별 `coverage` 카운터가 생기고, `covers(provider_calls)`가
**모든 필드를 모든 요청이 보고했을 때만** 참이 된다. 부분 합계는 계약대로 숫자로
남고 `complete=False`로 표시된다(모두 `None`으로 지우지 않는다).

배치 2건으로 확인한 동작:

| 사례 | in / out / total | complete | reported |
| --- | --- | --- | --- |
| 두 호출 모두 전체 보고 | 400 / 100 / 500 | **True** | 2/2 |
| 1번이 `prompt_tokens`만 | 300 / 50 / 250 | **False** | 2/2 |
| 2번이 `completion_tokens`만 | 200 / 59 / 250 | **False** | 2/2 |
| 1건은 `usage` 자체가 없음 | 200 / 50 / 250 | **False** | 1/2 |
| 어디에도 `usage` 없음 | None / None / None | **False** | 0/2 |
| 모두 0으로 보고 | 0 / 0 / 0 | **True** | 2/2 |
| `true`/`"50"` 같은 비정수 | 200 / 50 / 500 | **False** | 2/2 |

제기 당시에는 `reported_usage == provider_calls`만 보았기 때문에, 서로 다른 필드를
보고한 두 호출이 `complete=True`가 되어 `input=300, output=50, total=250`처럼 서로
맞지도 않는(300 + 50 ≠ 250) 부분 합계가 전체 청구액으로 제시됐다. 지금은 같은
입력에서 `complete=False`다. 0은 측정값으로, 미보고는 `None`으로 구분하는 성질도
유지된다.

## 해결 확인 — TokenUsage 요청 격리·정직한 미보고 처리

R9 외의 사용량 동작은 정확하다. 모두 실제 `OpenAICompatibleGateway` +
`httpx.MockTransport`이고 실호출은 없다.

- **요청 격리** — 서비스·HTTPX 클라이언트를 공유한 채 A(후보 3, 호출당 10 토큰)와
  B(후보 5, 호출당 100 토큰)를 동시에 돌리고 두 요청이 **실제로 동시에 떠 있었는지**
  (`Overlap.both_in_flight`)를 먼저 단언한다. A=30/30/60(3콜), B=500/500/1000(5콜)로
  섞이지 않는다. `ContextVar` 기반 `collect_metrics()`가 요청 단위로 수집한다.
- **호출이 없던 요청** — 전부 캐시 적중이면 `0/0/0`, `complete=True`,
  `provider_calls=0`. 호출을 안 했으므로 0이 실제 측정값이다.
- **usage 미보고** — 응답에 `usage`가 없으면 카운트가 `0`이 아니라 `None`으로 남고
  `complete=False`, `reported_calls=0`. 없는 측정을 0으로 지어내지 않는다.
- 파서는 `prompt_tokens`/`input_tokens` 양쪽 이름을 받고, `bool`과 문자열을 거부한다.

## 해결 확인 — V7 (입력 순서 동일성 단언, 닫음)

`candidate_set_must_be_identical`이 결과 ID 집합만 보던 것에 더해, 이제 비교 쌍의
**입력 후보 순서와 내용, 조회자 자기소개까지** 대조한다. 의도적으로 만든 교란을
실제로 거부하는지 확인했다.

```
same input order      -> pass: true   P1→P2 의도 변경 비교 통과
CONFOUND diff order   -> pass: false  입력 후보 제시 순서가 다름 (P2=z,y,x / P1=x,y,z)
CONFOUND viewer drift -> pass: false  두 사례의 조회자 자기소개가 다름
```

실제 사례 쌍은 그대로 통과한다(재생 출력에서 `baseline:lexical`·`module:scripted`가
E01→E02 `nayeon → doyun`으로 O, `baseline:rule`은 1순위 불변으로 X). 이로써 셔플
교정이 구조적 보장에서 **단언된 보장**으로 바뀌었고 V7을 닫는다.

## 해결 확인 — 평가 하네스 V1~V4

저장된 출력 재생(`node scripts/replay.js results/offline-latest.json`, 새 생성 호출
0건)으로 단언이 실제로 실행되는 것까지 확인했다.

- **V1 해결** — `CONSUMED_KEYS` 화이트리스트와 `unknownExpectationKeys()`가 생겨
  아무도 읽지 않는 기대값 키가 있으면 `expectation_keys` 검사가 **실패**한다.
  더 이상 조용히 통과하지 않는다. `cross_case`는 `runCrossCaseChecks()`로 구현되어
  `scripts/replay.js`에 연결됐다. 재생 출력에서 실제로 판정이 나온다:

  ```
  baseline:rule      E01→E02 X  yeongjin → yeongjin  (의도를 바꿨는데 1순위 그대로)
  baseline:lexical   E01→E02 O  nayeon → doyun
  module:scripted    E01→E02 O  nayeon → doyun
  ```

  AI-D1의 핵심 시연이 이제 단언되는 지점을 갖는다. `reason_must_mention_any_of`·
  `reason_required_for`도 `reason_content` 검사로 소비된다.
- **V2 해결** — `skip()`이 `skipped: true`를 달고, 집계가
  `applicable = componentResults.filter((c) => !c.skipped)` 기준으로 바뀌어 해당
  없는 검사가 분자·분모 어디에도 들어가지 않는다. 재생 표가 `통과/해당`으로
  표기되고 `ranking 4/13`처럼 분모가 줄어든 것이 보인다.
- **V3 해결** — `contentLength()`(`\p{L}\p{N}_`)와 `MIN_EXCERPT_CHARS`가
  `checkGrounding`에 적용돼 빈 인용·문장부호 인용이 더는 "원문에 근거함"으로
  통과하지 않는다. 모듈의 `app/ai/grounding.py` 기준과 같은 규칙이다.
- **V4 해결** — 예산 사전 확인이
  `assertAffordable(batches * max(1, maxAttempts), ...)`로 최악의 경우를 잡는다.
  `settings` 덮어쓰기의 `batch_size`·`max_attempts`를 우선한다.

이전에 해결된 것: **V5** `AIGatewayError(..., status_code=502)`가 `TypeError`라
`gateway_http_error` 주입 경로가 죽어 있던 것 → `AIGatewayHTTPError(502)`.
**V6** `ScriptedGateway._quotable()`로 모듈 기준보다 짧은 구절을 내지 않게 함.

## 해결 확인 — 실험 설계 교정 (닫음)

`lib/fixtures.js`의 셔플 시드가 `case_id` → `shuffle_group`으로 바뀌어, 의도만
바꾼 쌍이 같은 후보 순서를 공유한다.

```
E01 vs E02  SAME ORDER ✓   yeongjin > nayeon > minseo > seoyeon > boram > doyun
E01 vs E07  SAME ORDER ✓
H01 vs H02  SAME ORDER ✓   kyumin > woojin > narae > dain > seungho
```

교정 전에는 세 쌍 모두 달랐다(E01 `... doyun > seoyeon > minseo` vs
E02 `... seoyeon > minseo > doyun`). 후보 6명·`batch_size=5`면 배치가 2개로 갈리므로
순서가 다르면 배치 구성까지 달라지고, 규칙 기준선은 동점을 입력 순서로 깨기 때문에
의도 효과와 순서 효과가 섞인다. 정답 누출 방지 성질은 유지된다
(`authored_candidate_order`로 원래 순서를 별도 기록). 회귀 방어만 V7로 남는다.

## 해결 확인 — R7b (동시 요청 시 호출 계수)

R7 수정이 도입한 계수가 게이트웨이 인스턴스 단위라, 조회자가 다른 두
`recommend()`가 겹치면 서로의 POST를 셌다. 제기 당시 재현:

```
real POSTs total: 8 (A=3, B=5)  |  reported A=8, B=8  |  sum=16
sequential control: A=3 B=5   ← 순차 실행에서는 정확
```

수정은 `ContextVar` 기반 `count_attempts()`로 **요청 단위** 계수를 만들고,
게이트웨이가 `reports_attempts`로 실제 POST 보고를 약속한다. 회귀 테스트 두 종을
`tests/test_ai_review.py`에 두었고, 둘 다 두 요청이 **실제로 동시에 떠 있었는지**
(`Overlap.both_in_flight`)를 먼저 단언한다. 겹치지 않으면 옛 방식도 정답을 내므로
이 단언이 없으면 테스트가 무의미해진다.

- **운영 경로(실제 POST 수)** — 실제 `OpenAICompatibleGateway` +
  `httpx.MockTransport`. 후보마다 2회 거절 뒤 성공이라 POST 3회씩, A=9·B=15,
  합 24 = `gateway.attempts`. 이 요구를 배치 계수로 약화하지 않는다.
- **폴백 경로(미계측 스텁)** — `str`만 돌려주는 주입 게이트웨이는 내부 재시도를
  드러낼 수 없고, 서비스가 범위 없는 전역 카운터로 사설 재시도를 추정하지도
  않는다. 이때는 `complete()` 호출 수(배치당 1회)로 떨어지며 재시도를 못 센다는
  점이 코드와 테스트에 명시돼 있다. 동시성에서도 **범위**는 지켜져 A=3·B=5.

## 해결된 구현 결함 (R1~R8)

각 항목은 단언 충족뿐 아니라 수정이 다른 동작을 깨뜨리지 않았는지까지 독립 재현으로
확인했다. 재현 코드는 `server/tests/test_ai_review.py`에 이름(`test_r<N>_...`)으로
남아 있다.

| ID | 결함 | 수정 확인 근거 |
| --- | --- | --- |
| R1 | 전체 deadline이 캐시 읽기를 덮지 않음 | 공용 `asyncio.timeout_at`. 후보 4·deadline 0.5초·`get` 5초 → **0.50초** 종료, 후보 4명 전원 보존, `total_timeout` 기록 |
| R2 | 캐시 쓰기 실패가 배치를 통째로 폐기(`FAILED/CANCELLED`, `gateway_calls=0`) | 쓰기 실패 시 평가 보존. 정상 캐시에서는 저장 4건·호출 1회·2회차 적중 4건으로 캐시 경로 정상 |
| R3 | 문장부호 인용이 알림 게이트 통과 | `MIN_EXCERPT_CHARS=6` + `content_length()`(문자·숫자만). `"."`·`"다"` → `verified` 전부 False, `FAILED/UNGROUNDED_REASON`, 후보는 목록에 남고 알림 거부 |
| R4 | 스키마 위반이 `MISSING_IN_RESPONSE`로 보고 | `"score":"0.95"`·미지의 `evidence.source` 모두 `SCHEMA_MISMATCH` |
| R5 | 다른 조회자 결과가 "최신 입력과 일치"로 판정 | 조기 반환에서 결과 쪽 항목도 stale에 포함 |
| R6 | 캐시 항목의 `verified`·revision 무검증 신뢰 | 읽을 때 `verify_excerpts` 재실행 + 양쪽 revision 비교. 정상 적중은 그대로 동작하고 알림 상한(3) 정상 |
| R7 | `gateway_calls`가 실제 호출 수가 아님 | `OpenAICompatibleGateway.attempts`(재시도·실패 포함). `attempts` 없는 스텁에서도 예외 없이 실제 호출 수와 일치 |
| R8 | `"HTTP" in str(error)` 문자열 분류 | 전용 `AIGatewayHTTPError(status_code)` 타입 |

R3 재검증 주의: 수정 뒤 근거 없는 평가는 `EVALUATED`가 아니라
`FAILED / UNGROUNDED_REASON`이다. 최초 테스트의 `EVALUATED` 가정은 Codex가 지시한
grounding 변경으로 대체된 전제라, **후보 보존 + 미검증 + 알림 거부 + 점수·이유
보류**를 단언하도록 고쳤다. 결함을 덮은 것이 아니라 단언을 강화한 것이다.

### 회귀 방지로 고정한 정상 동작

부분 실패에서 후보 전원 보존·rank 연속·상태/점수 일관성 / 동시성 한도 뒤 대기 중인
배치도 전체 deadline 준수 / 호출자 취소 시 잔류 task 없음 / 캐시 적중에 **현재**
임계값 적용(재호출 없이 적합→부적합 전환) / 모델 변경 시 캐시 무효화 / 의도 충돌은
0.99여도 알림 거부하되 후보 유지 / 비유한 점수(`NaN`·`Infinity`) 3중 차단 /
`"0.9"`·`"yes"` 강제 변환 거부 / 비밀값이 설정 repr·dump, gateway repr, HTTP 오류
문구(키를 되비추는 401 본문에서도), `app.ai` 로그, 결과 DTO, `anomalies` 어디에도
없음 / 후보 중복·조회자 자기 자신은 `AIInputError`로 거부.

## 이 리뷰가 주장하지 않는 것

모듈이 제공자 주변에서 계약을 지키는지에 대한 증거다. 추천 품질, 기준선 대비 우위,
특정 모델의 성능, 5초 목표 달성, 알림 임계값의 적정성은 다루지 않았고 실모델을
호출하지 않았다. 오프라인 테스트 통과를 AI 품질 증거로 쓰지 않는다. 실사용 품질
근거는 평가 담당이 소유한다.
