// 데이터 계약. mock.js와 client.js는 이 모양을 똑같이 맞춘다.
// 여기가 협상 지점이다 — 화면 코드는 이 모양만 알면 되고, mock/client 어느 쪽이
// 응답하는지는 몰라도 된다. 백엔드(담당 3)에게 그대로 전달할 것.
//
// 서버 쪽 원본 모델은 spec/protocol.md 1번. 상태 코드는 같은 문서 2번
// (LOOKING_FOR / CAN_SHARE / FIRST_TIME / OPEN, 이번 제출의 유일한 세트).

/**
 * @typedef {Object} RoomMeta
 * @property {string} code
 * @property {string} title
 * @property {string} when
 * @property {{label:string, options:string[]|null, placeholder:string}} aff
 *   options가 null이면 자유 입력. 행사마다 다르다 (protocol.md 2-2번) — 코드에 박지 않는다.
 * @property {number} endsAt   운영진이 방 만들 때 한 번 정한 종료 시각(ms epoch).
 *   사람이 그 순간 누르는 버튼이 아니라 시각 비교로만 판단한다 — protocol.md 0-1번
 * @property {boolean} ended   now > endsAt. true면 참가자 화면을 아무것도 못 연다
 */

/**
 * @typedef {Object} Member
 * @property {string} id
 * @property {string} name
 * @property {string} school   실제로는 "소속" — 행사에 따라 학교/회사/팀 등 무엇이든 될 수 있다
 * @property {'LOOKING_FOR'|'CAN_SHARE'|'FIRST_TIME'|'OPEN'} st
 * @property {string} note     자유 입력 한 줄, 140자
 * @property {boolean} near    BLE로 닿는 거리인지 (지금은 mock 고정값)
 * @property {number} age      방에 들어온 뒤 지난 시간(초). 만료 계산의 기준값
 */

/**
 * @typedef {Object} Match
 * @property {string} personId       members 배열의 id를 가리킨다
 * @property {string} leadSubject    소개 문장용 명사구 ("배포·CI 경험")
 * @property {string} leadDetail     소개 문장용 서술 ("작년에 구축해보셨어요")
 * @property {string} reasonMine     "왜 이어드렸나" 도표 — 내 쪽 ("배포·CI 경험을 찾는 중")
 * @property {string} reasonTheirs   "왜 이어드렸나" 도표 — 상대 쪽 ("작년에 CI 파이프라인 구축")
 * @property {number} overlapWords   겹치는 단어 수 — 상보성 증거로 일부러 0을 보여준다
 * @property {number} score          0~1
 * @property {string} opener         추천 첫마디
 */

/**
 * @typedef {Object} DashboardStats
 * @property {number} joined         입장 인원
 * @property {number} capacity       참가자 정원 (등록 인원 등)
 * @property {number} statusSet      상태를 올린 인원
 * @property {number} matched        접점 발견 건수
 * @property {number} chatted        대화 시작 건수("좋아요" 누른 수)
 * @property {{label:string, count:number}[]} topics   많이 나온 주제. 최대 4개 정도
 */

/**
 * api 표면. mock.js와 client.js가 이 이름·모양을 지킨다.
 *
 * getRoom(code)                          -> Promise<RoomMeta>
 * join(code, {nick, school, status, note}) -> Promise<{id, name, school, st, note}>
 * updateStatus(code, id, {nick, school, status, note}) -> Promise<{id, name, school, st, note}>
 *   수정도 닉네임·소속을 포함해 전체를 다시 받는다 (편집 화면이 입장 화면 재사용이라서)
 * getMembers(code)                       -> Promise<Member[]>   (나를 제외한 목록)
 * getMatch(code, id)                     -> Promise<Match|null>
 * heartbeat(code, id)                    -> Promise<void>        (7단계에서 실제로 호출 시작)
 * getDashboard(code)                     -> Promise<DashboardStats>
 *   숫자 하드코딩 허용(PRD F5). 운영진 전용 — 참가자 화면과 같은 join 없이 조회한다
 * getMe(code, id)                        -> Promise<(Member & {joinedAt:number})|null>
 *   새로고침 복원용. sessionStorage에 남은 내 id로 "나 아직 여기 있던 사람 맞아?"를
 *   묻는다. 이미 5분 만료됐으면 null — 그러면 화면은 새로 입장한 것처럼 처리한다
 */
export {};
