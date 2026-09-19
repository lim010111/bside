# Bside — 프론트엔드

React + Vite + JavaScript/JSX. **2026-09-19 전면 개편 반영판** — `docs/development-contract.md`,
`docs/api-contract.md`, `docs/team-plan.md`(T01=김성빈)를 따른다. 예전 spec/*(상태 4종·소속·
5분 만료·BLE·ends_at 자동 종료) 기반 코드는 전부 걷어냈다.

## 실행

```bash
npm install
npm run dev
```

`?r=KOSS26`(기본) 또는 `?r=FEMEETUP`으로 방을 바꾼다. `?view=dashboard`는 운영진 대시보드
(개발 우선순위 아님, team-plan.md). `.env`에 `VITE_USE_MOCK=0`을 두면 `src/api/client.js`
(T05 전까지 미구현 에러)로 넘어간다.

## 뭐가 됐는지 — 실기기로 눌러서 확인함

**입장 → 목록(배너, 추천순) → 상세(자기소개·찾는 사람·추천 이유) → 채팅 → 내 정보 수정 →
참여 중단, 전체 경로가 목 데이터로 동작한다.**

- 입력: 닉네임 + 자기소개(1~500자) + 교류 의도(1~500자). 상태 선택·소속 없음
- 목록: 전체 참가자, 간결한 배너만(이름+자기소개 한 줄). 추천된 사람은 "추천" 표시
- 상세: 배너 클릭 → 자기소개 전문·찾는 사람·**현재 조회자를 위한 추천 이유**·채팅 시작
- 추천: intent/self_description의 키워드로 "도움 필요"↔"도와줄 수 있음"을 대충 상보적으로
  짝짓는다(`mock.js`의 `reasonFor`). **정확한 문자열 일치가 아니라 키워드 검사다** — 처음엔
  정확 일치로 짰다가 실제 자유 입력에서 항상 추천 0건만 나오는 버그를 실기기로 잡았다
- 채팅: `lib/bleChat.js`(여전히 mock). "서버에 남지 않는다" 안내 제거 — 이제 서버 저장 채팅이
  기본 전제다(BLE 아님)
- 내 정보 수정: 닉네임은 못 고친다(계약에 없음). 자기소개·교류 의도만. 참여 중단 버튼 포함
- 새로고침 복원: `sessionStorage`에 id만 두고 `getMe()`로 재확인. 영속 쿠키(계약)까지는
  아니고 세션 수준 — 실제 수명은 T02(서버)가 정한다
- 종료: 운영자 수동 종료만. `room.status: 'open'|'closed'`. 예정 시각·자동 타이머 없음

## 안 된 것 / 다음 (T05~T06)

- 서버 API 연결. `server/`는 아직 health check만 있어서 지금은 전부 mock
- 실제 AI 추천(T03). 지금 `reasonFor()`는 키워드 휴리스틱이지 모델 호출이 아니다
- SSE 실시간 갱신, 부재 중 메시지 복원(V05), 두 실기기 검증(V04)
- 대시보드는 옛 mock 숫자 그대로 — team-plan.md가 우선순위에서 뺐다

## 구조

```
src/
  api/
    shapes.js    데이터 계약 요약 (원본은 docs/api-contract.md)
    mock.js      목 구현. sessionStorage에 저장소를 얹어 새로고침 복원을 흉내낸다
    client.js    진짜 백엔드 스텁 (T05)
    index.js     스위치
  lib/bleChat.js 채팅 mock. 서버 저장 채팅으로 옮길 때(T06) 이 파일만 API 호출로 바뀐다
  state.jsx      useReducer + Context
  screens/
    Entry.jsx    입장 + 내 정보 수정 겸용
    Room.jsx     목록 (배너, 추천순)
    Detail.jsx   참가자 상세 + 추천 이유 + 채팅 시작
    Chat.jsx
    Dashboard.jsx, Ended.jsx
```

CSS(`src/index.css`)는 이전 상태색·근접·만료 관련 클래스가 일부 안 쓰인 채 남아있다 —
동작엔 지장 없지만 정리는 나중 순위.
