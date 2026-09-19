# 동결 프롬프트 추가 모델 비교 — 2026-09-20

기존 Haiku 설정을 유지할 것을 권고한다. 아래 수치는 고정된 사례 기대값과의 일치이며 일반적인 모델 정확도를 뜻하지 않는다. 기본 모델·프롬프트는 변경하지 않았다. 두 신규 모델은 기본 요청 20초에서 반복적인 timeout을 보여 이번 설정의 대체 모델로 권고하지 않는다.

## 조건

- 프롬프트 `2026-09-20.2` / `32db67109c375cf1`. GET `/v1/models` HTTP 200, 정확한 두 모델 ID 확인.
- 배치 5, 동시 4, 출력 4096, temperature 0.2, 총 1시도(재시도 0), 요청 20초·전체 45초.
- 허용 gateway `https://ai.cs.kookmin.ac.kr/v1`만 사용. E01 진단만 요청 60초·전체 90초이며 기본 점수에서 제외.

## 공통 7사례 비교

E01/E02/E03/E05/N01/N02/N03만 비교한다. 과거 전체 15사례·이전 프롬프트는 섞지 않았다.

| 모델 | 적용 검사 통과 | 평가 / 근거부족 / 실패 후보 | 호출실패 사례 |
|---|---:|---:|---:|
| baseline:lexical | 53/60 | 17 / 16 / 0 | 0 |
| module:claude-haiku-4-5 | 59/60 | 24 / 9 / 0 | 0 |
| module:deepseek-v3.2 | 55/60 | 18 / 10 / 5 | 1 |
| grok-4.6 | 43/60 | 0 / 8 / 25 | 5 |
| claude-sonnet-5 | 46/60 | 8 / 10 / 15 | 3 |

lexical은 모델이 아닌 문자열 기준선이다. 이전 두 실모델은 원본 digest가 동결값과 일치하는 행만 재채점했다.

## 신규 모델의 전체 결과

| 모델 | 실제 17사례 검사 | 평가 / 근거부족 / 실패 후보 | mock E08 | 누락 사례 | 교차 사례 | E01 민서 1위 | E02 영진·도윤 top2 |
|---|---:|---:|---:|---:|---:|---|---|
| grok-4.6 | 100/147 | 1 / 8 / 68 | 7/7 | 0 | 0/3 | 미충족 | 미충족 |
| claude-sonnet-5 | 117/147 | 19 / 16 / 42 | 7/7 | 0 | 0/3 | 미충족 | 미충족 |

후보 실패코드: grok-4.6 {"GATEWAY_TIMEOUT":67,"GATEWAY_HTTP_ERROR":1}; claude-sonnet-5 {"GATEWAY_TIMEOUT":42}.

사람 확인은 위 두 순위 조건에만 해당한다. 다른 세부 단언은 검증 담당의 가설이다. 정상 skipped는 분자·분모에서 제외하며 missing/error는 예정 fixture의 적용 검사 모두 실패로 유지한다. 호출 실패 후보도 결과에 보존되어 계약 검사 일부는 통과할 수 있지만, 해당 사례를 성공 평가로 세지 않는다. E08은 실패 주입이며 실모델 품질에서 제외한다. 교차 사례는 실제 `runCrossCaseChecks` 실행 결과를 별도로 표기했다.

## 제한 시간 진단

| 모델 | E01 시간 | 상태 | 기본 점수 포함 |
|---|---:|---|---|
| grok-4.6 | 23.702초 | {"EVALUATED":1,"FAILED":5} / {"OUTPUT_TRUNCATED":5} | 아니오 |
| claude-sonnet-5 | 22.137초 | {"EVALUATED":6} / {} | 아니오 |

## 후보 20명 성능

매 반복 빈 인메모리 캐시로 cold를 시작했다. warm은 같은 프로세스에서 즉시 다시 요청했다.

| 모델 | cold 3회 (초) | 중앙 / 범위 (초) | cold 평가/부족/실패 (각 회) | warm 호출 / 적중 | 순수 캐시 / 완전성 |
|---|---|---|---|---|---|
| grok-4.6 | 20.070, 20.059, 20.056 | 20.059 / 20.056–20.070 | 0/0/20, 0/0/20, 0/0/20 | 12 / 0 | 아니오 / 3쌍 완료 |
| claude-sonnet-5 | 20.062, 20.045, 20.049 | 20.049 / 20.045–20.062 | 0/0/20, 3/2/15, 0/0/20 | 11 / 5 | 아니오 / 3쌍 완료 |

warm에 호출이 있으면 cold 실패 후보의 재평가가 섞여 있으므로 순수 캐시 성능이 아니다. Redis·HTTP·Android 전체 성능 측정이 아니다. 5초 목표 달성을 주장하지 않는다. 각 반복 상태·실패코드·provider 토큰·complete 플래그·prompt/inference digest는 JSON에 기록했다.

## 재현과 한계

- [기계 판독 요약](../evals/reports/model-comparison-2026-09-20.json): 사례별 적용·통과 검사, 저장된 입력 후보 순서와 출처, 사람 확인, 교차 사례, 개별 benchmark phase와 토큰.
- 원본 응답은 ignored `server/evals/results/`에 있으며 프로필·응답 원문·비밀 헤더는 tracked 요약에 넣지 않았다.
- 초기 smoke 4행에는 실제 입력 순서가 저장되지 않았다. 당시 동일 loadCase 경로를 썼다는 근거로 현재 순서를 추정하지만 실제 저장 순서 검증으로 주장하지 않는다.
- 기존 모델과 이번 실행은 동일 추론 조건이지만 실행 시점·gateway 부하는 통제하지 않았다. 이번 timeout 결과를 모델의 본질적 품질 한계로 일반화하지 않는다.
- H/N은 이미 관찰한 사례이며 새 보류 데이터가 아니다. 금액 단가 미확인, 토큰 미보고/부분 보고는 complete 플래그를 따른다.
- 생성 호출: 신규 **91**, 누적 **208/240** (시작 117). 240은 운영 상한이며 금액 예산이 아니다.
- 형식·통신 오류 중단 기준: 연속 실제 사례 2개에서 모든 후보가 `GATEWAY_HTTP_ERROR`, `GATEWAY_NETWORK_ERROR`, `INVALID_JSON`, `SCHEMA_MISMATCH`, `OUTPUT_TRUNCATED`로 실패하면 후속 품질/benchmark를 중단한다. timeout만으로 중단하지 않는다.
- 프로세스 중단 marker가 있으면 자동 유료 재시도를 막는다. 응답을 장부 정산보다 먼저 저장하며, bridge 오류의 호출수 불명은 최악값 예약 후 수동 대조가 필요하다.

```bash
cd server/evals
EVAL_LIVE_CALL_CAP=240 node scripts/compare-models.js --live --stage=smoke
EVAL_LIVE_CALL_CAP=240 node scripts/compare-models.js --live --stage=diagnostic
EVAL_LIVE_CALL_CAP=240 node scripts/compare-models.js --live --stage=full
cd ..
EVAL_LIVE_CALL_CAP=240 uv run --frozen python evals/scripts/comparison-bench.py --live
cd evals
node scripts/comparison-summary.js
node scripts/comparison-report.js
node scripts/test-comparison.js
cd ..
uv run --frozen python evals/scripts/test-comparison-cleanup.py
```

원본: `results/comparison-quality-2026-09-20.json`, `results/live-targeted-prompt2.json`, `results/live-targeted-fresh.json`, `results/comparison-bench-2026-09-20.json`.

오프라인 검증: `test-comparison.js` 통과(누락 분모·사람 결과·교차 사례·benchmark 완전성/중앙값·저장 callback), `test-comparison-cleanup.py` 통과(예외 시 gateway 종료), `git diff --check` 통과. 전체 앱 테스트와 추가 생성 호출은 하지 않았다.
