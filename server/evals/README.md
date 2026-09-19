# AI 추천 평가 하네스

검증 담당 소유. 운영 모듈 `server/app/ai` 를 **그대로** 호출해 평가한다. 평가용 프롬프트를
따로 두지 않는다. 결과 해석과 한계는 [`server/docs/ai-validation.md`](../docs/ai-validation.md).

## 이 하네스가 주장하는 것과 아닌 것

- 여기의 '통과'는 **사례 파일에 적힌 기대값과 일치**했다는 뜻이다. 기대값은 대부분 검증
  담당이 모델 출력을 보기 전에 쓴 가설이며 `expectations.status: provisional-hypothesis`,
  `human_reviewed: false` 로 표시된다. 사용자가 확인한 범위만 `human_confirmed.keys` 에
  따로 적혀 있고, 보고서는 그 범위를 가설 단언과 분리해 표시한다.
- `module:scripted` 는 **모델 호출이 아니다.** 결정론적 가짜 게이트웨이로 모듈의 배치 분할·
  파싱·근거 검증·정책·캐시 경로를 오프라인에서 지나가게 한 것이다. AI 품질의 근거가 아니다.
- 모델이 낸 점수를 정확성의 근거로 쓰지 않는다. LLM-as-judge 를 쓰지 않는다.

## 실행

```bash
cd server/evals
npm install

npm run eval:offline     # 네트워크·모델 인증 없이 실행된다
npm run eval:live        # 게이트웨이 호출. 과금이 발생한다
# 저장된 출력 재채점·훑기. 새 생성 호출이 없다. 파일을 여러 개 주면 뒤에 적은 것이 이긴다.
node scripts/replay.js results/live-full.json results/offline-latest.json --detail
node scripts/threshold_sweep.js results/live-targeted-prompt2.json results/live-targeted-fresh.json

# 아래 둘은 server/ 에서 실행한다 (evals/ 기준으로 한 번만 올라간다)
cd ..
uv run python evals/bench/bench.py --mode scripted --repeats 5
uv run pytest tests/test_ai_acceptance.py -q
```

사례를 더하거나 고친 뒤에는 `node scripts/generate_tests.js` 로 테스트 목록을 다시 만든다.

## 구성

| 경로 | 내용 |
| --- | --- |
| `fixtures/participants.json` | 조정(tuning)용 참가자 풀. E01~E08 이 쓴다 |
| `fixtures/participants_heldout.json` | 보류 참가자 풀. H01~H07 전용 |
| `fixtures/participants_fresh.json` | 신선 보류 풀. 프롬프트 동결 후 만든 N01~N03 전용 |
| `fixtures/cases/*.json` | 사례 입력과 기대값. 기대값 출처 표시를 포함한다 |
| `fixtures/bench20.json` | 20명 성능 측정 전용 입력. 품질 판정에 쓰지 않는다 |
| `lib/baseline_rule.js` | 기준선 A: `web/src/api/mock.js` 규칙 추천기 이식. 한계는 파일 주석 참조 |
| `lib/baseline_lexical.js` | 기준선 B: 평가용으로 따로 명세한 자소 2-gram 기준선 |
| `lib/checks.js` | 기대값 대조 검사. 알려지지 않은 기대값 키는 실패로 처리한다 |
| `providers/module.js` | 운영 모듈 제공자(`scripted` / `live`) |
| `providers/bridge.py` | 파이썬 다리. 운영 `RecommendationService` 를 실제로 돌린다 |
| `harness/` | 브리지와 수용 테스트가 공유하는 사례 로더·가짜 게이트웨이 |
| `bench/bench.py` | 20명 콜드/캐시·반복 측정 |
| `scripts/` | 조사·테스트 생성·보고·재생·임계값 훑기 |

## 지켜야 할 것

- **보류 사례를 프롬프트 조정에 쓰지 않는다.** 한 번이라도 조정에 쓰면 보류가 아니다. 로더가
  풀을 분리해 읽고, 사례가 선언한 풀 밖의 인물을 참조하면 실패한다. **이미 결과를 본 사례는
  더 이상 신선한 보류가 아니다.** H01~H07은 1단계에서, N01~N03은 2단계에서 결과를 봤으므로
  다음 프롬프트 변경 때는 또 다른 새 사례가 필요하다.
- **의도만 바꾼 비교 쌍은 후보 제시 순서까지 같아야 한다.** 순서가 다르면 순위가 바뀐 원인이
  의도 변경인지 배치 맥락·동점 처리 차이인지 갈라낼 수 없다. `shuffle_group` 이 시드를 공유한다.
- **단언·집계 코드를 고쳤다고 유료 생성을 다시 부르지 않는다.** `scripts/replay.js` 로 저장된
  원본 출력을 다시 채점하고, 재생이라는 사실을 기록에 남긴다.
- **비밀값을 출력·기록하지 않는다.** 키는 `server/.env` 에서만 읽고 문서화된 게이트웨이
  호스트 외에는 쓰지 않는다(브리지와 조사 스크립트가 호스트를 검사한다).
- 실사용 예산은 **실제 배치 호출 수**로 센다(후보 6명·배치 5 = 2건, 재시도 포함 최악값으로
  사전 확인). 상한은 `EVAL_LIVE_CALL_CAP`(기본 80), 장부는 `results/live-budget.json`.
