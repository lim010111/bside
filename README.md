# Bside

**Connect with who's beside you.**
행사장에서 닿을 수 있는 거리에 있는 사람과 연결되는 앱.

> 코쓱톤 2026 · 국민대·숭실대·순천향대 연합 · 주제 **교류** · 제출 2026-09-20 12:00

---

## 한눈에

| | |
|---|---|
| **문제** | 네트워킹 시간에 혼자 온 사람은 누구에게 왜 말을 걸어야 할지 모른다 |
| **해결** | QR로 3초 입장 → 상태 한 줄 30초 → **AI가 상보 관계와 첫마디** → **BLE로 서버 없이 직접 대화** → 만난다 |
| **차별점** | 공통점이 아니라 **상보성**을 찾는다. 겹치는 단어가 0개인 두 사람을 잇는다 |
| **고객** | 사용자는 참가자, **돈은 주최자가 낸다** |

---

## 먼저 읽을 것

**[spec/MASTER.md](spec/MASTER.md)** — 이 문서 하나면 전체 그림이 잡힌다. 서비스 소개부터 기술 스택, 배포, 협업, 일정까지.

## 프로토타입 실행

```bash
cd prototype && python -m http.server 8777
```

`http://localhost:8777` 접속. 화면 6개가 목업 데이터로 전부 동작한다.
우하단 버튼으로 **빈 방 · 매칭 중 · 접점 없음 · 블루투스 꺼짐 · 긴 텍스트 · 만료 빨리감기**를 바로 볼 수 있다.

---

## 문서 지도

### `spec/` — 확정된 명세 (개발자가 보는 것)

| 문서 | 용도 |
|---|---|
| [MASTER.md](spec/MASTER.md) | **전체 총정리.** 여기서 시작 |
| [PRD.md](spec/PRD.md) | 기능 명세, P0/P1/P2, 수용 기준 |
| [protocol.md](spec/protocol.md) | **JSON 규격.** 이것만 지키면 셋이 서로 안 기다린다 |
| [prompts.md](spec/prompts.md) | LLM 프롬프트 전문 + 검증기 규칙 + 호출 수 관리 |
| [scenario.md](spec/scenario.md) | 시연 영상 컷 대본 + 5분 발표 대본 + 예상 질문 |
| [roadmap.md](spec/roadmap.md) | v0.1 ~ v1.0 버전 로드맵 |

### `docs/` — 대회 정보와 초기 분석

| 문서 | 용도 |
|---|---|
| [hackathon-brief.md](docs/hackathon-brief.md) | 배점, 마감, 발표 규정과 원본 근거 |
| [planning.md](docs/planning.md) | 초기 기획 분석과 결정 기록 |
| [technical-findings.md](docs/technical-findings.md) | BLE 플랫폼 제약 공식 문서 조사 |
| [discussedw-raw.md](docs/discussedw-raw.md) | 팀 논의 원문 (보존용) |
| [info/](docs/info/) | 주최 측 안내 이미지 15장 |

### `research/` — 근거 자료

발표와 질의응답에서 인용할 숫자의 출처. 전부 링크가 달려 있다.

| 폴더 | 내용 |
|---|---|
| [ideas/](research/ideas/) | 검토했다 접은 아이디어 6개와 사유 |
| [market/](research/market/) | **근거리 서비스 실패 부검**, 경쟁 지형, GTM, 가격, 온보딩 수요 |
| [naming/](research/naming/) | 이름 후보 충돌 검사 3라운드 |
| [tech/](research/tech/) | 에이전트 프로토콜 검증, 입력 마찰 |

**질의응답에서 가장 많이 쓸 문서**: [market/proximity-postmortem.md](research/market/proximity-postmortem.md)
왜 Highlight·Sonar·Zenly가 죽었고 우리는 왜 다른지가 1차 출처와 함께 정리돼 있다.

### 기타

| | |
|---|---|
| [CONTEXT.md](CONTEXT.md) | 공통 용어집. 기획·디자인·개발이 같은 말을 쓰기 위한 것 |
| [prototype/index.html](prototype/index.html) | **모바일 HTML 프로토타입.** 화면 6개 + 엣지 케이스 |
| [spec/design.md](spec/design.md) | 디자인 토큰, AI 티 회피 규칙 |
| [data/profiles.json](data/profiles.json) | 시연용 시드 프로필 |
| [pitch/script.md](pitch/script.md) | 이전 버전 발표 대본 (**구버전**, [spec/scenario.md](spec/scenario.md) 참조) |

---

## 기술 스택

| 층 | 선택 |
|---|---|
| 프론트 | React + Vite |
| 앱 래핑 | Capacitor (안드로이드) |
| BLE | `@capgo/capacitor-bluetooth-low-energy` |
| 백엔드 | FastAPI + uvicorn |
| 상태 | 메모리 dict (**DB 없음**) |
| 실시간 | SSE |
| LLM | `ai.cs.kookmin.ac.kr` (OpenAI 호환) |
| 배포 | OCI + Caddy + nip.io |

아이폰 사용자는 같은 웹 주소로 들어오면 BLE만 없이 전부 동작한다.

---

## 협업

**브랜치 + PR.** PR은 작게, **30분 안에 머지**를 기본으로.

```
main            ← 항상 동작하는 상태
  feat/server   ← FastAPI
  feat/web      ← React 화면
  feat/ble      ← Capacitor + BLE
  feat/ai       ← 프롬프트·매칭
```

같은 파일을 두 사람이 만지지 않도록 디렉터리를 먼저 가른다.
[protocol.md](spec/protocol.md)의 JSON 모양만 지키면 서로 기다릴 일이 없다.

---

## 지금 할 일

1. 게이트웨이 충전코드 받고 **API 호출 1회 성공**
2. 안드로이드 스튜디오·JDK 설치 확인
3. OCI에 Caddy + nip.io로 HTTPS 접속 확인
4. FastAPI 뼈대 + Vite 프로젝트 생성
5. 팀명 정하기 (제출 파일명에 필요)

상세는 [spec/MASTER.md](spec/MASTER.md) 11번.
