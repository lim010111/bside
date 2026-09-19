# 팀 개발 안내 — BLE MVP

현재 제품은 Android BLE 발견·인터넷 서버·지속 ON·추천 목록과 자동 알림·바로 채팅·기존 대화 유지·설치 단위 복원이다. 행사에서도 같은 흐름을 쓰고 시연 데이터도 동일하게 취급한다. 제품 원본은 [B1~B14](../docs/product-direction.md), 행동은 [개발 기준](../docs/development-contract.md)을 따른다.

## 읽는 순서

1. [PRD](PRD.md), [공통 용어](../CONTEXT.md).
2. [개발 기준](../docs/development-contract.md), [API](../docs/api-contract.md), [Android 구성](../docs/android-design.md), [저장](../server/docs/redis.md).
3. [화면](design.md), [프론트 작업](frontend-plan.md), [프로토콜](protocol.md), [AI 지침](prompts.md).
4. [팀 작업](../docs/team-plan.md), [검증](../docs/validation.md), [시연](scenario.md), [배포](../docs/deployment.md).

별도 요청·수락은 B13으로 폐기했다. 행사 방·QR 입장·운영자 종료·시연 전용 삭제도 없다. 장시간 배터리 최적화와 부가 채팅 기능을 선결 조건으로 만들지 않는다.

선택 구성은 React/Vite + Capacitor Android + Kotlin, FastAPI·Redis다. 현재 코드는 mock/서버 기반이며 네이티브 BLE와 제품 API는 구현 전이다. 기존 구현·이력 문서가 최신 제품 계약을 덮어쓰지 않는다. 팀은 4명이고 김성빈 프론트 외 실명 배정은 미정이다. 외부 일정·평가 기준은 [해커톤 원본](../docs/hackathon-brief.md)을 따른다.
