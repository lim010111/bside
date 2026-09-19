> **이력 자료:** BLE 전환 전 문서와 전환 중 안내를 보존한 자료입니다. 본문의 현재·확정 표기는 현행 요구가 아닙니다. [최신 결정](../../../product-direction.md)을 따릅니다.

# BLE 기술 조사와 검증 후보

## 이번 BLE MVP에 적용할 최신 조사

이번 MVP부터 BLE 발견을 핵심 흐름으로 사용하며 인터넷 연결이 필요하다([B1·B3](../../../product-direction.md)). B2는 직접 끌 때까지 발견 참여를 유지하는 방식으로 확정했다. 배터리 최적화·장시간 성능 검증은 사용자가 해커톤 이후로 미뤘으며, 아래 연구의 수치를 이번 합격 기준으로 사용하지 않는다. [지속 BLE 발견의 종합 조사](../../../../research/tech/ble-always-on.md)에 배터리, 잠금 상태, 서버·LLM·알림 비용과 실기기 검증 계획을 통합했다.

기존의 iOS 26 Live Activity 설명에는 보완이 필요하다. Apple 엔지니어는 잠금 상태에서 화면까지 꺼지면 전경 수준 스캔 권한을 유지하지 못한다고 설명한다. Live Activity만으로 주머니 속 상시 발견을 보장하지 않는다. [2026년 2월 공식 포럼 설명](https://developer.apple.com/forums/thread/815189)

## 이전 행사 MVP 시점의 기술 비교 기록

> **2026-09-19 제품 방향 전환:** 이 문서는 과거 기술 조사·후보 설계입니다. BLE 방향 채택이 기존 Android·GATT·무서버 설계 전체의 채택을 뜻하지 않습니다. 플랫폼과 발견·전송 책임은 새 결정에 맞춰 갱신합니다. 현재 결정과 문서 전환 상태는 [BLE 근접 교류 전환](../../../product-direction.md)을 먼저 확인합니다.

상태: **공식 문서 조사 완료, 실기기 검증 미실시.** 사용자는 MVP를 행사·밋업에 한정하고 BLE·무서버를 수단 후보로 두기로 결정했다. 스택 선택은 위임받았으며, 기존 Kotlin + Jetpack Compose 추천은 BLE 휴대폰 간 발견을 유지할 때의 조건부 검토안이다. 웹 기반 행사 입장도 함께 비교한다. 사용자 지시에 따라 현재 작업 환경은 플랫폼 선택의 근거로 사용하지 않는다. 테스트 기기는 선택한 구성을 검증하기 위해 별도로 확인한다. 아래 내용은 구현 완료 보고가 아니다.

현재 선택: 행사 방 전체·부재 중 메시지 보관·브라우저 복원 요구에 맞춰 **모바일 웹 + FastAPI + Redis, REST 전송·조회와 SSE 갱신**을 사용한다. 초기 SQLite 안은 최신 main의 Redis 기반을 비교한 뒤 변경했다. [팀 개발 기준](../../../development-contract.md)에 현재 선택을 기록한다. 아래 BLE 조사와 실기기 검증 후보는 대안 검토 근거이며, 현재 MVP의 필수 작업 목록으로 사용하지 않는다.

## 플랫폼 선택에 영향을 주는 사실

| 대상 | 확인한 사실 | 설계에 미치는 영향 |
| --- | --- | --- |
| Android | 광고·스캔 API를 제공하지만 광고 지원은 기기별 확인이 필요하다. Android 12 이상을 타깃으로 하는 앱에는 사용 기능에 맞는 Bluetooth 런타임 권한이 필요하다. | 실제 기기에서 광고·스캔 동시 동작과 권한 거부 처리를 검증한다. |
| iOS | 일반 Core Bluetooth 광고는 local name과 service UUID 키를 지원하며 공간이 제한된다. | 임의 프로필 데이터를 광고 패킷에 직접 넣는 방식을 플랫폼 공통 전제로 삼지 않는다. |
| 일반 웹/PWA | Web Bluetooth의 기본 범위는 central 역할로 원격 GATT 서버에 연결하는 것이다. 기기 선택은 사용자 조작이 필요하다. | 웹 페이지 두 개만으로 서로 광고하며 자동 발견하는 설계는 적합하지 않다. 네이티브 브리지 사용은 별도 선택이다. |

근거: [Android 기기 지원 API](https://developer.android.com/reference/android/bluetooth/BluetoothAdapter), [Android 권한](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions), [Apple 광고 API](https://developer.apple.com/documentation/corebluetooth/cbperipheralmanager/startadvertising%28_%3A%29), [Chrome Web Bluetooth 공식 가이드](https://developer.chrome.com/docs/capabilities/bluetooth).

### 일반 웹의 적용 범위

웹으로 교류 서비스를 만들 수 있다. 제한되는 것은 원문의 **두 휴대폰이 주변에 자신의 존재를 알리고 서로 자동 발견해 BLE로 직접 상태를 교환하는 구조**다.

- 일반 Web Bluetooth는 central 역할에서 이미 BLE 서비스를 제공하는 기기에 연결해 데이터를 읽고 쓰는 범위를 제공한다. 웹 페이지 자체를 BLE peripheral·GATT server로 만들어 상대 휴대폰이 발견하고 접속하게 하는 기능은 제공하지 않는다. ‘웹은 데이터 송신이 안 된다’는 설명은 부정확하다. 연결한 주변 기기에 데이터를 쓰는 것은 가능하다. [Chrome 공식 설명](https://developer.chrome.com/docs/capabilities/bluetooth)
- 기본 기기 선택 API는 사용자 조작과 브라우저의 선택 창을 거친다. 주변 광고를 폭넓게 스캔하는 API는 구현 현황상 실험 기능이다. [API와 구현 현황](https://github.com/whatwg/bluetooth/blob/main/implementation-status.md)
- Safari는 Web Bluetooth를 기본 지원하지 않는다. 별도 확장이나 전용 앱을 설치하는 우회 방식은 존재하지만, 링크만 열어 사용하는 일반 모바일 웹과는 배포 조건이 다르다. [브라우저별 지원 현황](https://github.com/whatwg/bluetooth/blob/main/implementation-status.md#safari)
- PWA로 설치하는 것만으로 브라우저에 없는 peripheral 기능이 추가되지는 않는다. 웹 UI에 네이티브 BLE 브리지를 붙이는 구성은 가능하나, 네이티브 기능 구현과 앱 설치·배포가 필요한 하이브리드 앱으로 다룬다.

| 제품 구성 | 웹 적용 판단 | 제품 약속에 생기는 차이 |
| --- | --- | --- |
| 행사·구역 QR로 입장하고 서버로 상태 공유·반응·AI 추천 | 일반 웹으로 구현 가능한 방향 | ‘같은 방에 입장한 참가자’이며 현재 물리적 근접성을 증명하지 않음 |
| GPS 기반 가까운 사용자 표시 | 웹 위치 권한과 서버를 이용하는 별도 설계 후보 | 실내의 세밀한 근접성과 BLE 직접 통신을 대체한다고 보장할 수 없음 |
| 두 휴대폰의 BLE 자동 발견과 무서버 상태 공유 | 일반 웹만으로 구현 불가 | native BLE 기능이 필요함 |
| 웹 UI + native BLE 브리지 | 하이브리드 앱으로 가능 | 웹 개발 방식을 활용하지만 앱 설치·배포와 네이티브 통합이 필요함 |

기획 판단: 행사 QR 기반 웹은 설치 없이 참가시키는 흐름을 만들 수 있으므로 현장 참여와 데모에 유리한 후보다. 다만 이 방식으로 전환하면 원문의 근거리·무서버 특성을 그대로 구현했다고 설명할 수 없다. 이 차이를 선택한 후 스택을 확정한다.

### 백그라운드와 거리

Android에서는 필터 없는 스캔이 화면 꺼짐 시 중단되며, 배경 동작과 프로세스 수명 처리는 별도 설계가 필요하다. [스캔 API](https://developer.android.com/reference/android/bluetooth/le/BluetoothLeScanner), [배경 BLE 가이드](https://developer.android.com/develop/connectivity/bluetooth/ble/background)

iOS의 일반 배경 모드에서는 발견 이벤트 병합·지연과 광고 내용 변경이 발생한다. 한편 iOS 26 이상에는 CBManager 생성 후 Live Activity를 시작하면 일부 전경 수준 동작을 배경에서도 허용하는 지원이 있으므로, 배경 BLE 전체가 불가능하다고 단정하지 않는다. 목표 OS와 실제 사용 조건을 정해 검증해야 한다. [Apple 일반 배경 동작](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html), [현행 Core Bluetooth 안내](https://developer.apple.com/documentation/corebluetooth)

RSSI는 환경과 기기 배치에 영향을 받는다. 따라서 발견 여부나 대략적인 근접도부터 검토하며, 정확한 미터 거리나 고정 반경 보장은 실증 없이 요구사항에 넣지 않는 방향을 제안한다. [Bluetooth SIG의 RSSI 설명](https://www.bluetooth.com/blog/proximity-and-rssi/)

## 첫 기술 검증 제안

아래는 BLE를 실제 전송 방식으로 검토할 때 적용할 **45~60분 제한 검증안**이다. 현재 BLE는 수단 후보이며 채택은 확정되지 않았다. 아래 수치는 팀의 합의를 받지 않은 후보 기준이다.

1. 실제 기기 2대의 모델·OS·광고 지원 여부를 기록한다. 교차 OS 지원이 필수면 해당 조합을 먼저 사용한다.
2. 양쪽 앱을 화면에 열고, Wi-Fi·모바일 데이터는 끄며 Bluetooth를 켠다.
3. 서로 발견 → 짧은 상태·프로필 읽기 → 양방향 반응 교환을 반복한다. 광고로 발견하고 GATT로 내용을 교환하는 방식을 우선 검증할 수 있다. [GATT 데이터 교환](https://developer.android.com/develop/connectivity/bluetooth/ble/transfer-ble-data)
4. 발견 시간·반응 수신 시간·실패 횟수를 기록한다. 후보 통과 기준은 10회 중 9회 이상 성공, 발견 5초 이내, 반응 수신 2초 이내다.
5. 화면 잠금·앱 전환·Bluetooth 재시작을 각각 시험하고, 전경 성공과 배경 성공을 따로 기록한다.
6. 이후 3대 동시 참여, 중복 목록, 상태 갱신, 상대 이탈을 확인한다.

API의 쓰기 성공과 상대 앱에 반응이 표시된 것을 구분해서 확인한다. 목표 시간 안에 핵심 동작이 성립하지 않으면 실패 조건을 기록하고 플랫폼·범위·전송 방식 중 무엇을 조정할지 결정한다.

## 통신 설계에서 남은 선택

[BLE 구현 설계안](ble-design.md)에 임시 ID, 31바이트 광고, GATT 상세 조회, 메시지 분할·ACK·재시도·만료에 대한 구체안을 기록했다. 구현·검증 전의 제안이며, 제품 흐름과 공개 범위 결정 후 계약을 고정한다.

## 광고 크기와 채팅 메시지 길이

Q12의 글자 수·사진 전송 질문에 따라 공식 자료를 재확인했다. **BLE의 1회 전송 크기와 앱의 전체 메시지 크기는 구분한다.**

| 구분 | 확인한 제약 | 채팅에 대한 의미 |
| --- | --- | --- |
| 발견용 광고 | 31바이트는 legacy advertising의 광고 데이터 한도. 확장 광고는 별도 규격 | 이를 그대로 ‘채팅은 몇 글자까지’라는 제한으로 사용하지 않음 |
| 연결 후 GATT 교환 | 일반적인 write·notification의 값 길이는 `ATT_MTU − 3`바이트 이내이며 MTU는 기기 간 지원 범위에 따라 정해짐 | 앱에서 긴 본문을 조각으로 나눠 보내고 재조립 가능. 제한 단위는 글자 수가 아닌 바이트 |
| 큰 데이터 | 단일 attribute의 최대 길이와 앱이 여러 번 전송하는 전체 데이터 길이는 다름 | 사진도 바이너리 조각을 보내는 방식으로 구현 가능하다는 것이 전송 구조에서의 결론. 전송 시간·끊김·재시도 처리는 별도 구현·검증 대상 |

근거: [Bluetooth SIG BLE Primer](https://www.bluetooth.com/bluetooth-le-primer/), [Bluetooth SIG ATT 규격](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core-54/out/en/host/attribute-protocol--att-.html).

실제 처리량은 기기·연결 설정·무선 환경에 따라 달라진다. 제조사의 조건을 통제한 처리량 예제를 휴대폰 간 성능 보장으로 사용하지 않는다. [Nordic 연결·처리량 가이드](https://devzone.nordicsemi.com/guides/nrf-connect-sdk-guides/b/software/posts/building-a-bluetooth-application-on-nrf-connect-sdk-part-3-optimizing-the-connection)

제품 판단: 사진 제외는 MVP 범위를 줄이는 선택으로 기록한다. 텍스트 길이 제한은 UI·보관·전송 부담을 고려해 별도로 정할 수 있으며, 광고 한도에서 자동 도출하지 않는다. 현재 같은 행사 방 전체의 참가자에게 채팅하는 요구와 BLE 직접 연결의 도달 범위·연결 가능 여부도 별개다. 이후 Q15까지의 답변을 반영해 채팅은 서버 전송·저장으로 구성하기로 선택했다.
