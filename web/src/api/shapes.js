// 데이터 계약. mock.js와 client.js는 이 모양을 똑같이 맞춘다.
// 원본은 docs/api-contract.md — 여기는 그 문서를 프론트 코드 관점으로 옮긴 요약이다.
// 필드·한도·오류 코드가 바뀌면 저 문서를 먼저 고치고 여기를 따라 고친다.
//
// 2026-09-19 전면 개편: 상태 선택(LOOKING_FOR 등 4종)·소속·5분 만료·BLE 채팅·
// 시각 기반 자동 종료를 전부 걷어냈다. 팀 Q1~Q20 합의 사항이며 되돌리지 않는다.
// 자세한 이유는 docs/development-contract.md.

/**
 * @typedef {Object} RoomMeta
 * @property {string} code
 * @property {string} title
 * @property {'open'|'closed'} status   운영자가 수동으로만 바꾼다. 예정 종료 시각 없음
 * @property {string|null} closedAt
 */

/**
 * @typedef {Object} Participant
 * @property {string} id
 * @property {string} nickname            1~20자
 * @property {string} self_description    1~500자. "나는 이런 사람"
 * @property {string} connection_intent   1~500자. "이런 사람을 만나고 싶다"
 * @property {'active'|'stopped'} participation_status
 * @property {number} profile_version     자기소개·교류의도를 실제로 바꿀 때만 증가
 * @property {string} joined_at
 */

/**
 * @typedef {Object} Recommendation
 * @property {string} candidate_id
 * @property {number} rank                낮을수록 상위. 평가 안 된 후보는 아예 없음(목록에서 빠짐, 삭제 아님)
 * @property {string|null} reason         "ready"일 때만 문자열. 그 외엔 null
 * @property {'ready'|'pending'|'unscored'|'failed'|'unavailable'} state
 */

/**
 * api 표면. mock.js와 client.js가 이 이름·모양을 지킨다. 화면 코드는 항상
 * api/index.js를 통해서만 부른다.
 *
 * getRoom(code)                                  -> Promise<RoomMeta>
 * join(code, {nickname, self_description, connection_intent})
 *                                                 -> Promise<Participant>  (기존 참가자면 덮어쓰지 않고 그대로 반환)
 * getMe(code, id)                                -> Promise<Participant|null>   새로고침 복원용
 * updateMe(code, id, {self_description, connection_intent, expected_profile_version})
 *                                                 -> Promise<Participant>
 * stop(code, id)   / resume(code, id)             -> Promise<Participant>
 * getParticipants(code)                          -> Promise<Participant[]>   나를 제외한, participation_status active만
 * getParticipant(code, viewerId, targetId)        -> Promise<{participant: Participant, recommendation: Recommendation}>
 * getRecommendations(code, viewerId)              -> Promise<Recommendation[]>   순위 목록 (배너 정렬용)
 * getChatMessages(code, conversationId)           -> Promise<Message[]>
 * sendMessage(code, {recipientId, clientMessageId, text}) -> Promise<Message>
 * getDashboard(code)                              -> Promise<DashboardStats>   개발 우선순위 아님(team-plan.md), 있으면 씀
 */
export {};
