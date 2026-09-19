# 최신 main 비교와 채택 결과

검토일: 2026-09-19. 기획을 `861fab6`으로 먼저 로컬 커밋하고 `git fetch origin main`으로 받은 [baea751](https://github.com/lim010111/kosscchthon/commit/baea7518c4820b249dfe3c90151302fc0833ce06)을 비교했다. 사용자는 비교 도중 **충돌 시 더 나은 방식을 채택**하도록 위임했다. 이 기록은 그 위임에 따라 main 기준으로 정리한 PR 변경안이다. 사용자 요청에 따라 앞서 만든 로컬 병합은 철회했고, 기획·명세 변경을 별도 PR로 제공한다. 원격 main에 직접 push하거나 운영 배포하지 않았다. PR 준비 시 원격 main이 같은 커밋인지 다시 확인했다.

## 결론과 선택

**main의 React/Vite 화면과 FastAPI·Redis·Docker 기반을 재사용하고, 제품 규칙은 Q1~Q20으로 통일한다.** 제품 저장·추천·채팅 구현은 아직 시작할 부분이다. 기존 코드를 완성 MVP로 평가하거나 UI를 처음부터 재작성하지 않는다.

| 충돌 | 채택 | 이유·구현 영향 |
| --- | --- | --- |
| TypeScript 제안 ↔ 구현된 JavaScript/JSX | JavaScript/JSX 유지 | 타입 언어 전환보다 공통 예시·서버 검증과 실제 연결을 우선한다. 기존 UI·CSS 재사용 |
| SQLite 제안 ↔ Redis 기반 | Redis 단독 + AOF `always` + 기존 volume 유지 | 클라이언트·Compose·준비 상태 검사를 재사용. 저장 모델·중복 방지는 새 구현이 필요하며 자동 완성으로 보지 않음 |
| 새 배포안 ↔ 기존 OCI·Nginx | 기존 기반 + 같은 출처 화면·`/api` | 서버·도메인을 추가하지 않고 쿠키·SSE 경계를 단순하게 유지. 실제 배포는 미검증 |
| 한 줄·상태 선택 ↔ 자기소개·교류 의도 | 닉네임과 두 자유 입력 | 사용자가 원하는 다양한 관계를 표현. 소속·역할 선택을 필수로 두지 않음 |
| 상보성 필터·단일 추천 ↔ 전체 참가자 우선순위 | 전체 목록 + 양쪽 의도에 따른 순위 | 낮은 점수만으로 후보를 지우지 않음. 모든 배너에서 상세·채팅 진입 |
| 5분 만료·탭 종료 시 초기화 ↔ 행사 종료까지 복원 | 영속 브라우저 세션·서버 저장 | 앱 종료는 참여 중단이 아님. 명시적 중단·재개만 참여 상태 변경 |
| BLE 직접 채팅 ↔ 부재 중 보관 | 서버 저장 채팅, REST + SSE | 앱을 닫은 동안 받은 메시지도 복원. BLE는 이번 MVP에서 제외 |
| 예정 시각 종료 ↔ 운영자 수동 종료 | 운영자 수동 종료 | 종료 시각 입력 없이 방 준비. 일반 참가자에게 종료 권한 없음 |

JavaScript·Redis는 위임된 기술 선택이다. 사용자 제품 요구를 main의 ‘확정’ 표기나 구현 편의로 바꾸지 않는다. 참가 인원·모델·성능은 검증되지 않았으며 현재 설치된 도구와 OS는 선택 근거로 쓰지 않았다.

## 우선 해결할 구현 차이

### 1. 실제 API·사용자 간 채팅이 아직 없다

서버는 [health router만 등록](https://github.com/lim010111/kosscchthon/blob/baea7518c4820b249dfe3c90151302fc0833ce06/server/app/main.py#L38)하고 프론트의 [실제 API 함수는 미구현 오류](https://github.com/lim010111/kosscchthon/blob/baea7518c4820b249dfe3c90151302fc0833ce06/web/src/api/client.js#L16)를 던진다. 채팅은 [고정 초기 메시지·자동 답장](https://github.com/lim010111/kosscchthon/blob/baea7518c4820b249dfe3c90151302fc0833ce06/web/src/lib/bleChat.js#L10)이며 [화면을 나가면 배열을 비운다](https://github.com/lim010111/kosscchthon/blob/baea7518c4820b249dfe3c90151302fc0833ce06/web/src/state.jsx#L124). 실제 BLE도 구현되지 않았다.

채택한 조치: 서버에 세션·참가자·대화·메시지를 구현하고 프론트 채팅을 API 경계 안으로 옮긴다. Redis 기반이 있다는 사실과 메시지를 저장한다는 사실을 구분한다. 핵심 확인은 V04~V08의 실제 두 사용자 답장·부재 중 복원이다.

### 2. 입력·추천·상세 흐름을 바꿔야 한다

[Entry](https://github.com/lim010111/kosscchthon/blob/baea7518c4820b249dfe3c90151302fc0833ce06/web/src/screens/Entry.jsx#L52)는 닉네임·소속·상태·140자 한 줄을 받는다. [mock 추천](https://github.com/lim010111/kosscchthon/blob/baea7518c4820b249dfe3c90151302fc0833ce06/web/src/api/mock.js#L218)은 LOOKING_FOR에게 첫 CAN_SHARE를 고르고 고정 이유·0.85를 반환한다. [일반 카드는 열 수 없고](https://github.com/lim010111/kosscchthon/blob/baea7518c4820b249dfe3c90151302fc0833ce06/web/src/components/PersonCard.jsx#L15), [예전 프롬프트](https://github.com/lim010111/kosscchthon/blob/baea7518c4820b249dfe3c90151302fc0833ce06/spec/prompts.md#L45)는 STUCK×EXPERIENCED만 후보로 허용한다.

채택한 조치: 자기소개와 찾는 사람을 별도로 받고, 같은 방 전체를 순위로 보여준다. 모든 배너에서 해당 참가자의 두 원문·현재 조회자에 대한 이유를 확인하고 채팅한다. 숫자 점수·자동 첫마디는 필수로 넣지 않는다. 수정하면 입력 버전에 맞게 추천을 갱신한다. LLM-as-judge 등 산정 방식은 AI 담당에게 남겨 두되 E01~E08의 기대 동작은 고정한다.

입장 전 개인 미리보기를 없앤 UI는 재사용한다. 다만 [App의 선행 목록 조회](https://github.com/lim010111/kosscchthon/blob/baea7518c4820b249dfe3c90151302fc0833ce06/web/src/App.jsx#L22)도 입장 후로 옮기고 서버에서 입력 전 개인 데이터 접근을 거부해야 한다. 숨긴 화면만으로 공개 범위를 구현한 것은 아니다.

### 3. 복원·중단·종료 정책을 고쳐야 한다

기존 [protocol](https://github.com/lim010111/kosscchthon/blob/baea7518c4820b249dfe3c90151302fc0833ce06/spec/protocol.md#L124)은 탭 종료 후 새 사람, 5분 부재 시 삭제, 예정 시각 종료를 명시한다. 실제 mock도 [sessionStorage](https://github.com/lim010111/kosscchthon/blob/baea7518c4820b249dfe3c90151302fc0833ce06/web/src/state.jsx#L9)와 [300초 복원 제한](https://github.com/lim010111/kosscchthon/blob/baea7518c4820b249dfe3c90151302fc0833ce06/web/src/api/mock.js#L195)을 사용한다. 종료 화면의 [‘남은 기록 없음’](https://github.com/lim010111/kosscchthon/blob/baea7518c4820b249dfe3c90151302fc0833ce06/web/src/screens/Ended.jsx#L18)은 삭제 구현으로 뒷받침되지 않는다.

채택한 조치: 브라우저를 다시 열어도 같은 참가자로 복원하고 앱을 닫은 참가자를 목록에 남긴다. 중단은 명시적 API로 처리하고 같은 참가자로 재개한다. 운영자 종료 시 개인별 접근을 막고 실제 정리는 별도 수행한다. 종료 문구는 이용 종료만 안내하며 삭제 완료를 미리 주장하지 않는다.

### 4. Redis 보존 설정과 배포 연결을 보완한다

기존 [AOF everysec](https://github.com/lim010111/kosscchthon/blob/baea7518c4820b249dfe3c90151302fc0833ce06/server/compose.yaml#L23)를 `always`로 바꿨다. Redis 공식 문서는 everysec의 최근 약 1초 유실 가능성과 always의 fsync 이후 응답을 설명한다. 이를 근거로 저장 성공 알림의 내구성을 강화하는 쪽을 선택했다. 실제 디스크 지연·장애 복원은 검증해야 한다. [공식 영속화 정책](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/#how-durable-is-the-append-only-file)

메시지·중복 요청·순번·중단·종료는 [저장 계약](../../server/docs/redis.md)에 따라 원자적으로 처리한다. Lua의 다른 요청 차단을 실패 시 자동 롤백과 혼동하지 않는다. Redis 외 저장소는 추가하지 않는다.

기존 Nginx 기록의 `8100`과 Compose 기본 `8000`은 용도를 구분하고 배포 시 맞춘다. 같은 출처 `/api` 연결과 기존 volume 유지 조건은 [배포 문서](../deployment.md)에 정리했다. 운영 주소의 실제 상태는 확인하지 않았다.

## 팀 문서와 병합 처리

- 실제 Git 충돌은 `README.md`, `docs/planning.md`, `docs/technical-findings.md` 세 파일이었다. 사용자 결정 기록을 유지하면서 새 구현·기술 선택을 반영했다.
- 자동 병합되는 `spec/*`에도 제품 의미 충돌이 있었으므로 MASTER·PRD·protocol·prompts·roadmap·scenario·frontend-plan을 현재 계약과 맞췄다. 디자인 토큰·화면·기존 실행 기반은 재사용한다. 이전 상세 내용은 위 고정 커밋과 Git 이력에 남아 있다.
- `web/README.md`, `server/README.md`, Redis 문서에 현재 구현과 앞으로 구현할 계약을 구분했다. 기존 mock의 상태·거리·5분 만료·BLE 문구는 [프론트 변경 계획](../../spec/frontend-plan.md)에서 수정 파일과 함께 인계한다.
- 개발은 [T00~T08](../team-plan.md) 순서로 이어간다. 새 scaffold 작성과 별도 대시보드·BLE 개발을 선행하지 않는다. 공통 입력·목록·상세 연결 뒤 실제 채팅·복원, AI·상태·종료를 합친다.

## 실행한 검증과 한계

고정 main의 프론트·서버를 각각 임시 디렉터리에 추출해 검증했다.

| 검증 | 결과 |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | 성공 |
| `npm run build` | 성공, Vite 8.3.0, 34 modules |
| `npm run lint` | 종료 코드 0, `state.jsx:145`의 `react(only-export-components)` 경고 1개 |
| `uv run --locked pytest` | 4개 통과, 의존성 deprecation 경고 2개 |
| 제품 API·실제 AI·두 기기·BLE | 미구현 또는 이번 미검증. 위 검사를 제품 통합 통과로 쓰지 않음 |
| 실제 Redis·Docker·운영 배포 | 이번 환경에서는 실행하지 않음. main 팀원의 과거 실행 기록과 구분 |

통합 중 앱 소스·의존성은 변경하지 않았고 Redis AOF 설정과 문서를 갱신했다. 원본 main과 앱 소스·잠금 파일이 동일한 것도 확인했다. 따라서 위 결과는 재사용한 코드의 확인이며 AOF 설정의 실행 검증은 아니다.

통합 후 정적 확인: 로컬 Markdown 링크 168개, JSON 예시 9개, V01~V12·E01~E08의 존재, Compose YAML의 AOF always·영속 volume·내부 Redis 주소를 확인했다. 문서 충돌 표시·불필요한 중국어 문구는 없고 `git diff --check`를 통과했다. 별도 읽기 전용 재검토에서도 현재 계약과 팀 진입 문서 사이의 의미 있는 모순을 발견하지 못했다.
