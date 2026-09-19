# Android BLE MVP 구현 구성

상태: **기존 기술 선택 위임에 따른 구현 기준 제안. 실제 코드 변경·단말 검증 전.** 사용자에게 프레임워크를 다시 선택받는 문서가 아니다. 제품 요구는 [B1~B14](product-direction.md), 행동 계약은 [개발 기준](development-contract.md)을 따른다. 배터리 최적화·장시간 성능 논의는 해커톤 이후로 미룬다.

## 구성 선택

**React/Vite 화면을 Capacitor Android 앱에 묶고, Kotlin으로 BLE와 Android 수명주기를 구현하는 구성을 개발 출발점으로 선택한다.** 기존 화면·컴포넌트·CSS·API 계층 경계를 재사용하면서 광고·스캔·권한·백그라운드 작업은 네이티브가 담당하도록 한다. 스택 선택은 위임된 엔지니어링 결정이며 사용자 발언으로 기록하지 않는다. [기존 웹 프로젝트 통합](https://capacitorjs.com/docs/getting-started), [Android 네이티브 코드 통합](https://capacitorjs.com/docs/android/custom-code)

| 계층 | 책임 |
| --- | --- |
| React | 자기소개·의도 입력, 주변 목록·상세, 바로 채팅, 실제 발견 작동 상태 표시 |
| Kotlin | Bluetooth·권한 상태, 스캔·광고, 관측 중복 처리, 발견 참여 설정, 백그라운드 관측 보고 |
| FastAPI | 사용자/임시 식별자 해석, 근접·참여 조건 검사, 추천, 새 대화·메시지 권한 |
| Redis 영속 저장 | 대화 관계·메시지 저장. 기존 행사별 키 구조는 대체해야 함 |

BLE는 발견과 최소 신원 연결에 쓰고, 추천·채팅은 인터넷 서버로 처리하는 방향을 선택한다. 거리 이탈 뒤에도 대화가 유지된다는 B8/B13와 맞는 구성이다. BLE 직접 채팅과 모든 상대의 GATT 연결 유지는 필요 조건이 아니다. 원문의 Android/GATT 채팅 초안을 재채택하지 않는다.

## 대안

- **Kotlin/Compose로 화면 전체 재작성:** 네이티브 통합은 명확하지만 현재 React 화면 자산을 다시 작성해야 한다. 이번에는 화면 재사용을 우선한다.
- **일반 웹/PWA:** 문서화된 Web Bluetooth의 기기 선택·GATT 연결 흐름만으로 승인된 휴대폰 간 자동 발견을 구성하지 않는다. [Chrome 공식 안내](https://developer.chrome.com/docs/capabilities/bluetooth)
- **브라우저 데모를 실제 BLE로 간주:** 최신 main `16349c7`의 `web/src/api/mock.js`는 localStorage 기반 행사 데모다. 과거 `bleChat.js`와 `bleConnected: true`는 main에서 제거됐다. 현재 데모도 실제 근접 발견·서버 저장·두 기기 통신의 증거는 아니다.

## Android 구현 출발점

사용자가 앱을 열고 발견 참여를 켤 때 네이티브 작업을 시작한다. 공통 서비스 UUID 필터로 스캔하며 광고용 임시 식별자와 프로필/새 대화 권한은 서버에서 연결한다. 식별자·UUID의 광고 바이트 예산, 회전과 관측 유예는 기술 계약에서 정하며 미검증 포맷을 확정하지 않는다. [광고 API](https://developer.android.com/reference/android/bluetooth/le/BluetoothLeAdvertiser)

React 타이머나 WebView가 계속 실행된다는 가정에 BLE를 맡기지 않는다. 화면이 중단되어도 필요한 작업은 네이티브가 맡고, 복귀한 UI는 네이티브와 서버 상태를 다시 조회한다. Android의 필터 기반 `PendingIntent` 스캔을 검토하며, 광고·탐지 수명주기에 지속적인 서비스가 필요하면 전경에서 시작하는 `connectedDevice` foreground service를 검증한다. 서비스 알림·시작 제한을 지키며 FGS만으로 영구 동작이 보장된다고 하지 않는다. [백그라운드 BLE](https://developer.android.com/develop/connectivity/bluetooth/ble/background), [Foreground service 유형](https://developer.android.com/develop/background-work/services/fgs/service-types)

사용 기능에 따른 Bluetooth 권한을 요청한다. `neverForLocation`은 GPS 미사용만으로 자동 선언하지 않는다. B12에 따라 이번 MVP에 추천 알림을 포함하며 Android 알림 권한을 처리한다. 권한 거부와 발견 참여 의사를 구분한다. [Bluetooth 권한](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions), [알림 권한](https://developer.android.com/develop/ui/views/notifications/notification-permission)

## 저장·네트워크·배포 경계

이번 앱은 설치가 필요하다. 기존 ‘QR 링크만 열면 설치 없이 사용’ 설명을 폐기한다. 개발 빌드는 실제 Android 단말에 설치하여 검증하고, 사용자 설치 시 배포용 APK와 안내가 필요하다. 앱스토어 공개 출시는 자동 포함하지 않는다. 최소 OS와 SDK·라이브러리 버전은 단말·의존성 확인 후 고정하며 현재 환경의 설치 여부를 제품 선택 근거로 쓰지 않는다. [실기기 실행](https://developer.android.com/studio/run/device), [ADB 설치](https://developer.android.com/tools/adb)

앱 안에 묶인 웹 자산과 서버가 기존 웹 배포처럼 같은 출처라는 전제는 더 이상 성립하지 않는다. HTTPS API 주소, origin/CORS 또는 네이티브 HTTP 경계, 인증 정보 보관 방식을 새 API 계약에 명시한다. B11에 따라 설치 단위 식별을 사용하고 앱 재실행 시 같은 사용자·소개·대화를 복원한다. 앱 재설치·기기 변경 복원은 제외한다. 인증 정보 저장·백업 제외 등 구체 계약은 후속 설계에서 정한다. 기존 브라우저 쿠키 계약을 그대로 옮기지 않는다.

기존 FastAPI·Redis 기반은 재사용한다. 행사별 키·행사 종료 후 삭제는 새 모델에서 사용하지 않으며, 시연 데이터도 일반 데이터와 같은 보관 정책을 적용하며 이번 MVP에 시간 기반 자동 삭제·시연 종료 특별 삭제를 추가하지 않는다. 장기 보관 정책은 별도 후속 범위다. 앱을 닫은 동안의 수신과 관계 보관은 연결 소켓 자체가 아니라 서버 저장으로 처리한다. B12는 자동 추천 알림 포함으로 확정했다. 원격 갱신·알림의 세부 구현을 구체화하고 실제 문제가 발생하면 범위를 재검토한다.

## 이번에 확인할 것

B12의 백그라운드 가능 여부에 관한 상세 답변은 아래 구획을 따른다. 구현 가능성과 현재 구현 완료를 구분한다.

- 두 실제 Android 기기에서 광고·발견·신원 연결·서버 반영.
- 별도 수락 없는 첫 메시지·양방향 대화, 거리 이탈/발견 OFF 뒤 기존 대화 유지.
- 전경→다른 앱→화면 잠금→복귀에서 실제 작동과 중단 상태를 기록. 성공하지 않은 상태를 지원한다고 표시하지 않음.
- Bluetooth OFF·권한 거부·사용자 발견 OFF, 네트워크 단절/복귀.
- B11의 동일 설치 사용자 복원. B12의 백그라운드 자동 추천 알림 검증.

8시간 배터리 시험, 하루 탐지율 보장, 제조사 전체 최적화는 이번 선결 조건이 아니다. 에뮬레이터의 UI 확인과 실제 BLE 검증을 구분한다.

## 백그라운드 발견부터 추천 알림까지

**선택한 React/Vite + Capacitor Android + Kotlin + FastAPI 구성에는 구현 경로가 있다.** 다만 현재 `web/package.json`에는 Capacitor 의존성이 없고 네이티브 BLE·알림 계층은 구현 전이다. 기존 React 웹 화면만으로 이미 지원하는 기능처럼 소개하지 않는다.

| 단계 | 앱 화면을 보지 않을 때의 담당 |
| --- | --- |
| 참여 시작 | 앱 전경에서 사용자 ON과 필요한 권한을 받아 네이티브 작업 시작 |
| 광고·발견 | Kotlin의 Android BLE API와 네이티브 수명주기 처리. 서비스 필요 시 foreground service 및 상태 알림 |
| 서버 보고 | Kotlin에서 유효 관측을 HTTPS로 전송. WebView 타이머·React 실행과 독립 |
| 추천 평가 | FastAPI에서 후보·참여 조건을 확인하고 서버에서 평가. 사용자 화면 실행 여부와 독립 |
| 알림 표시 | Kotlin이 결과를 받은 뒤 Android 알림 표시, 또는 서버의 FCM 전송 후 Android에서 표시 |
| 앱 복귀 | UI가 네이티브·서버 상태를 조회하여 목록·대화 복원 |

`foreground service`는 사용자가 인지할 수 있는 상태 알림을 동반하는 작업 방식이며 앱 화면을 계속 전경에 열어 놓으라는 의미가 아니다. 시작·권한·서비스 유형 제약은 지켜야 한다. 필터 기반 `PendingIntent` 스캔 역시 검토 대상이며, 이 API가 광고 지속성과 전체 추천 파이프라인의 영구 실행까지 보장하는 것은 아니다. [백그라운드 BLE](https://developer.android.com/develop/connectivity/bluetooth/ble/background), [서비스 유형](https://developer.android.com/develop/background-work/services/fgs/service-types)

알림은 두 경로를 비교한다. 짧은 요청 안에서 추천 결과를 받을 수 있다면 실행 중인 네이티브 작업이 결과를 받아 로컬 알림을 표시할 수 있다. 평가를 비동기로 처리하거나 상대 기기에도 결과를 전달하려면 서버→FCM→Android 경로가 적절한 후보다. FCM을 자동 채택한 것은 아니며, B12 채택에 맞춰 구현 단순성과 시연 조건으로 정한다. 서버 푸시는 BLE 탐색을 대신하지 않고 네이티브 처리 제약을 무시하는 수단도 아니다. [FCM Android 수신](https://firebase.google.com/docs/cloud-messaging/android/receive-messages), [Android 알림 만들기](https://developer.android.com/develop/ui/views/notifications/build-notification)

단순히 홈으로 이동하거나 화면을 잠근 경우를 목표 검증으로 삼는다. 설정에서 앱을 강제 중지하거나 사용자가 실행 작업을 중단한 경우에도 계속 탐색한다고 약속하지 않는다. 최근 앱 목록에서 화면을 닫는 것, OS에 의한 프로세스 종료, 설정의 강제 중지는 구분해서 기록한다. 알림 권한 거부 시 추천이 계산되더라도 사용자 알림이 보이지 않을 수 있고, Doze·제조사 절전·네트워크 단절로 지연될 수 있다. [Doze](https://developer.android.com/training/monitoring-device-state/doze-standby), [알림 권한](https://developer.android.com/develop/ui/views/notifications/notification-permission)

B12 채택에 따른 이번 최소 검증은 실제 두 Android 기기에서 **참여 ON → 홈 이동 또는 잠금 → 주변 발견 → 서버 추천 → 시스템 알림 → 알림을 눌러 상세 열기**이다. 장시간 배터리 최적화는 보류하지만 이 기본 기능의 확인까지 생략하는 것은 아니다. 현재는 이 시연을 수행하지 않았다. 사용자 지시에 따라 실제 구현·시연에서 문제가 확인되면 그때 범위를 재검토한다.
