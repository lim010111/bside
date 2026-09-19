# 코쓱톤 프로젝트 — BLE 기반 주변 교류

사전에 행사 방이나 QR을 준비하지 않은 곳에서도 주변의 참여자를 발견하고, 자기소개와 양쪽 교류 의도를 바탕으로 연결을 돕는 서비스입니다. **이번 MVP는 Android 사용자 간 BLE 발견과 인터넷 서버를 사용하며, 별도 수락 없이 바로 1:1 채팅합니다.**

발견 참여는 직접 끌 때까지 유지합니다. 유효하게 발견한 참여자 전체를 추천 순서로 보여주고 적합한 새 상대를 자동 알림합니다. 이미 시작한 대화는 거리 이탈·발견 OFF 뒤에도 유지합니다. 회원가입 없이 같은 설치에서 복원하며 재설치·기기 간 복원은 제외합니다. 행사에서도 같은 흐름을 사용하고 시연 데이터도 일반 데이터와 동일하게 취급합니다.

## 현재 기준

| 문서 | 역할 |
| --- | --- |
| [제품 결정 B1~B14](docs/product-direction.md) | 사용자 최종 합의·번복 이력 |
| [제품 요약](spec/PRD.md) | 범위와 핵심 흐름 |
| [개발 기준](docs/development-contract.md) | 발견·첫 메시지·기존 대화·복원·알림 행동 |
| [공통 용어](CONTEXT.md) | 현재 모델의 용어 |
| [Android 구현 구성](docs/android-design.md) | React/Capacitor/Kotlin과 서버의 역할 |
| [API 계약](docs/api-contract.md) · [저장 계약](server/docs/redis.md) | 식별·관측·추천·메시지 경계 |
| [검증](docs/validation.md) · [팀 계획](docs/team-plan.md) | 실제 Android 시연·AI 평가와 작업 분담 |
| [해커톤 기준](docs/hackathon-brief.md) | 외부 제출·평가 규정 |
| [발표 흐름](pitch/script.md) | 실제 검증 상태에 맞춰 사용할 발표안 |

이번 MVP의 BLE 전환은 [ADR-0001](docs/adr/0001-ble-discovery-mvp.md), Android·머무는 상대 우선은 [ADR-0002](docs/adr/0002-android-dwell-mvp.md), 발견과 관계 수명 분리는 [ADR-0004](docs/adr/0004-discovery-and-relationships.md), 바로 채팅·동일 데이터 취급은 [ADR-0005](docs/adr/0005-direct-chat-uniform-data.md)를 따릅니다. ADR-0003의 요청·수락 모델은 폐기했습니다.

## 구현·검증 상태

최신 main `16349c7`에는 React/Vite 화면, 행사 기반 HTTP/SSE 클라이언트, 브라우저 데모와 회귀 테스트가 있습니다. 개발 실행은 데모, 일반 배포 빌드는 실제 HTTP 연결을 기본으로 합니다. FastAPI·Redis 기반은 있지만 서버 제품 API, Capacitor·Kotlin 계층, 실제 AI·BLE·두 사용자 통합은 미구현·미검증입니다. 기존 웹 구현과 새 BLE 계약의 차이는 [프론트 README](web/README.md)에 기록했습니다.

자동 추천 알림은 일단 포함하고 실제 문제가 확인되면 재검토합니다. 장시간 배터리 최적화·iPhone·교차 OS는 후속 범위입니다. 플랫폼 선택은 현재 개발 환경의 설치 여부가 아니라 제품 요구와 기존 화면 자산을 근거로 했습니다.

팀은 4명이며 김성빈이 프론트를 담당합니다. 나머지 배정은 제안입니다. [웹 실행](web/README.md), [서버 실행](server/README.md), [배포 경계](docs/deployment.md)를 참고합니다. 문서화와 실제 구현·배포를 구분합니다.

## 이전 문서

이전 행사 MVP 명세·운영자 종료·방별 API·5분 소멸·무저장 발표안은 [문서 이력](docs/history/README.md)에 보존했습니다. 이력과 연구는 현재 요구보다 우선하지 않습니다. 기존 AI 후속 결정과 Promptfoo 선택은 [기획 기록](docs/planning.md)과 [AI 지침](spec/prompts.md)에 유지합니다.
