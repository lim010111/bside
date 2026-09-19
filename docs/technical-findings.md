# BLE 기술 근거와 검증 범위

2026-09-20. 최신 조사 원본은 [지속 BLE 발견 조사](../research/tech/ble-always-on.md), 선택 구성은 [Android 설계](android-design.md)다. 이전 행사 웹/무서버 비교는 [이력](history/event-mvp/docs/technical-findings.md)으로 보존한다.

이번 사용자 결정은 Android 간 BLE 핵심 발견, 지속 참여, 인터넷 필요, 백그라운드 자동 추천 알림 포함이다. 장시간 배터리 최적화는 이후로 미룬다. 실제 두 기기의 기본 발견·서버 보고·알림을 확인하는 것은 이번 검증에 포함한다.

React/Vite 화면을 Capacitor로 묶고 Kotlin이 BLE·Android 수명주기·서버 보고·알림을 담당한다. 일반 웹 UI만으로 휴대폰 간 배경 광고·스캔을 지원한다고 설명하지 않는다. FastAPI·Redis는 UI 종료와 독립적으로 추천·메시지를 저장한다.

공식 문서 근거와 제약은 Android 설계의 각 링크를 따른다. API가 있다는 사실과 현재 단말에서 성공했다는 사실을 구분한다. iOS의 화면 꺼짐·광고 제약은 Android 우선 선택의 근거이며 iPhone을 구현 완료한 것으로 해석하지 않는다. RSSI를 정확한 미터 거리나 건물 경계 증명으로 사용하지 않는다.
