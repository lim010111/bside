// 목 구현. prototype/index.html의 ROOMS(358)·STATUSES(377)·SEED_HACK(388)·SEED_MEET(482)·
// LATE(530)를 그대로 옮겼다. api/shapes.js의 모양을 따른다.
//
// getMatch()의 매칭 로직은 하드코딩이다. 실제 상보성 판단은 AI 레이어(담당 1) 몫이고
// spec/prompts.md에 프롬프트가 있다 — 여기서는 그 결과 모양만 흉내낸다.

/* 행사마다 다른 것은 전부 여기 있다. 코드에 박지 않는다.
   주최자가 방을 만들 때 정하고, 참가자 화면은 이 설정을 따라간다. */
export const ROOMS = {
  KOSS26: {
    title: '코쓱톤 네트워킹',
    when: '국민대 미래관 4층 · 오늘 18:00까지',
    aff: { label: '소속', options: ['국민대', '숭실대', '순천향대'], placeholder: '직접 입력' },
    seed: () => SEED_HACK,
  },
  FEMEETUP: {
    title: '서울 프론트엔드 밋업',
    when: '성수 코워킹 · 오늘 21:00까지',
    aff: { label: '회사', options: null, placeholder: '예: 토스, 프리랜서, 취준' },
    seed: () => SEED_MEET,
  },
};

export const STATUSES = [
  { k: 'LOOKING_FOR', label: '이런 분 찾아요', icon: 'i-search', ph: '배포·CI 경험 있으신 분 찾아요' },
  { k: 'CAN_SHARE', label: '이런 얘기 할 수 있어요', icon: 'i-msg', ph: '작년에 도커로 CI 파이프라인 구축해봤어요' },
  { k: 'FIRST_TIME', label: '처음 왔어요', icon: 'i-hand', ph: '혼자 왔어요. 기획하다가 백엔드가 궁금해졌어요' },
  { k: 'OPEN', label: '대화 가능', icon: 'i-circle', ph: '뭐든 편하게 말 걸어주세요' },
];
export const SL = Object.fromEntries(STATUSES.map((s) => [s.k, s.label]));
export const SHORT = { LOOKING_FOR: '찾는 중', CAN_SHARE: '나눌 수 있음', FIRST_TIME: '처음', OPEN: '대화 가능' };

// 구체적인 한 줄. 뭉뚱그린 말은 가짜처럼 보인다.
// 방은 명단이 아니라 군중이다. 한 화면에 다 안 들어와야 AI가 골라줄 이유가 생긴다.
const SEED_HACK = [
  { id: 'minseo', name: '민서', school: '순천향대', st: 'CAN_SHARE', note: '작년에 도커로 CI 파이프라인 구축해봤어요', near: true, age: 40 },
  { id: 'yerin', name: '예린', school: '숭실대', st: 'CAN_SHARE', note: 'React 상태관리로 삽질 오래 했어요. 물어보셔도 돼요', near: true, age: 56 },
  { id: 'taehyun', name: '태현', school: '숭실대', st: 'FIRST_TIME', note: '혼자 왔어요. 기획하다가 백엔드가 궁금해졌어요', near: false, age: 93 },
  { id: 'sua', name: '수아', school: '국민대', st: 'LOOKING_FOR', note: '디자인 시스템 토큰 잡아보신 분 계실까요', near: false, age: 130 },
  { id: 'junho', name: '준호', school: '순천향대', st: 'OPEN', note: '커피 들고 서 있어요. 아무나 오세요', near: false, age: 167 },
  { id: 'p5', name: '지훈', school: '국민대', st: 'LOOKING_FOR', note: '백엔드 한 분만 더 필요해요. 팀 아직 3명이에요', near: true, age: 204 },
  { id: 'p6', name: '하윤', school: '숭실대', st: 'CAN_SHARE', note: '작년에 이 대회 나갔어요. 심사 분위기 궁금하면 물어보세요', near: false, age: 241 },
  { id: 'p7', name: '서연', school: '국민대', st: 'FIRST_TIME', note: '해커톤 처음이라 뭐부터 해야 할지 모르겠어요', near: false, age: 278 },
  { id: 'p8', name: '도윤', school: '순천향대', st: 'OPEN', note: '밥 같이 드실 분', near: false, age: 33 },
  { id: 'p9', name: '지우', school: '숭실대', st: 'LOOKING_FOR', note: '피그마 프로토타입까지 해보신 분 있나요', near: false, age: 70 },
  { id: 'p10', name: '은채', school: '국민대', st: 'CAN_SHARE', note: '피그마 오토레이아웃은 좀 합니다', near: true, age: 107 },
  { id: 'p11', name: '시우', school: '순천향대', st: 'FIRST_TIME', note: '1학년이고 아직 할 줄 아는 게 별로 없어요. 구경하러 왔어요', near: false, age: 144 },
  { id: 'p12', name: '나연', school: '숭실대', st: 'CAN_SHARE', note: 'AWS 프리티어로 배포까지 해봤어요', near: false, age: 181 },
  { id: 'p13', name: '건우', school: '국민대', st: 'LOOKING_FOR', note: '안드로이드 빌드 에러 같이 봐주실 분', near: false, age: 218 },
  { id: 'p14', name: '유진', school: '순천향대', st: 'OPEN', note: '자판기 앞에 있어요', near: false, age: 255 },
  { id: 'p15', name: '채원', school: '숭실대', st: 'CAN_SHARE', note: '발표 많이 해봤어요. 대본 봐드릴 수 있어요', near: true, age: 10 },
  { id: 'p16', name: '현우', school: '국민대', st: 'LOOKING_FOR', note: '소켓 통신 해보신 분 5분만 시간 내주실 수 있나요', near: false, age: 47 },
  { id: 'p17', name: '다은', school: '순천향대', st: 'FIRST_TIME', note: '팀 없이 왔는데 괜찮을까요', near: false, age: 84 },
  { id: 'p18', name: '정민', school: '숭실대', st: 'CAN_SHARE', note: '타입스크립트 제네릭 헷갈리시면 오세요', near: false, age: 121 },
  { id: 'p19', name: '소율', school: '국민대', st: 'OPEN', note: '아무 얘기나 좋아요. 코딩 얘기 아니어도 됩니다', near: false, age: 158 },
  { id: 'p20', name: '재현', school: '순천향대', st: 'LOOKING_FOR', note: 'Firebase 인증 붙이다 막혔어요. 해보신 분', near: true, age: 195 },
  { id: 'p21', name: '윤서', school: '숭실대', st: 'CAN_SHARE', note: '앱 스토어 심사 두 번 통과시켜봤습니다', near: false, age: 232 },
  { id: 'p22', name: '승현', school: '국민대', st: 'FIRST_TIME', note: '학교에서 혼자 와서 아는 사람이 없네요', near: false, age: 269 },
  { id: 'p23', name: '가은', school: '순천향대', st: 'CAN_SHARE', note: '파이썬으로 크롤링 많이 해봤어요', near: false, age: 24 },
  { id: 'p24', name: '준서', school: '숭실대', st: 'LOOKING_FOR', note: '발표 자료 만들어주실 분 급하게 찾습니다', near: false, age: 61 },
  { id: 'p25', name: '하은', school: '국민대', st: 'OPEN', note: '노트북 충전 중이라 30분 묶여 있어요. 심심해요', near: true, age: 98 },
  { id: 'p26', name: '민재', school: '순천향대', st: 'CAN_SHARE', note: 'PM 인턴 했었어요. 기획서 봐드릴게요', near: false, age: 135 },
  { id: 'p27', name: '서윤', school: '숭실대', st: 'FIRST_TIME', note: '디자인 전공인데 개발 쪽 어떻게 굴러가는지 보고 싶어요', near: false, age: 172 },
  { id: 'p28', name: '지호', school: '국민대', st: 'LOOKING_FOR', note: '지도 API 써보신 분 계신가요. 카카오든 네이버든', near: false, age: 209 },
  { id: 'p29', name: '예준', school: '순천향대', st: 'CAN_SHARE', note: '웹소켓이랑 SSE 둘 다 써봤어요. 차이 설명해드릴 수 있어요', near: false, age: 246 },
  { id: 'p30', name: '수빈', school: '숭실대', st: 'OPEN', note: '야식 뭐 시킬지 고민 중인데 같이 정하실 분', near: true, age: 283 },
  { id: 'p31', name: '동현', school: '국민대', st: 'LOOKING_FOR', note: 'OAuth 리다이렉트에서 계속 막힙니다', near: false, age: 38 },
  { id: 'p32', name: '아름', school: '순천향대', st: 'FIRST_TIME', note: '비전공자예요. 코딩은 부트캠프에서 조금 배웠어요', near: false, age: 75 },
  { id: 'p33', name: '성민', school: '숭실대', st: 'CAN_SHARE', note: '일러스트 그릴 줄 알아요. 아이콘 필요하시면', near: false, age: 112 },
  { id: 'p34', name: '혜원', school: '국민대', st: 'OPEN', note: '4층 창가에 있어요. 조용해요', near: false, age: 149 },
  { id: 'p35', name: '영진', school: '순천향대', st: 'LOOKING_FOR', note: '팀원 구해요. 기획 둘에 개발 하나라 개발자가 급해요', near: true, age: 186 },
  { id: 'p36', name: '지민', school: '숭실대', st: 'CAN_SHARE', note: '깃 충돌 나면 불러주세요. 그건 자신 있어요', near: false, age: 223 },
  { id: 'p37', name: '우진', school: '국민대', st: 'FIRST_TIME', note: '편입생이라 아는 사람이 아예 없어요', near: false, age: 260 },
  { id: 'p38', name: '보람', school: '순천향대', st: 'CAN_SHARE', note: '논문 쪽 관심 있으면 얘기해요. NLP 랩 있었어요', near: false, age: 15 },
  { id: 'p39', name: '태윤', school: '숭실대', st: 'LOOKING_FOR', note: '테스트 코드 어떻게 짜야 할지 감이 안 와요', near: false, age: 52 },
  { id: 'p40', name: '세연', school: '국민대', st: 'OPEN', note: '담배 피우러 나갈 건데 같이 가실 분', near: true, age: 89 },
  { id: 'p41', name: '규민', school: '순천향대', st: 'FIRST_TIME', note: '작년에 신청했다가 못 왔어요. 올해가 처음이에요', near: false, age: 126 },
  { id: 'p42', name: '하영', school: '숭실대', st: 'CAN_SHARE', note: '디자인 툴은 웬만한 거 다 써봤어요', near: false, age: 163 },
  { id: 'p43', name: '진우', school: '국민대', st: 'LOOKING_FOR', note: '발표 대본 같이 봐주실 분 있을까요', near: false, age: 200 },
  { id: 'p44', name: '예은', school: '순천향대', st: 'FIRST_TIME', note: '3학년인데 이런 거 한 번도 안 해봤어요', near: false, age: 237 },
];

// 같은 코드가 다른 행사를 돌린다. 밋업은 소속이 학교가 아니라 회사다.
const SEED_MEET = [
  { id: 'minseo', name: '민서', school: '4년차', st: 'CAN_SHARE', note: '디자인 시스템 2년째 운영 중이에요. 삽질 얘기 해드릴게요', near: true, age: 40 },
  { id: 'yerin', name: '예린', school: '프리랜서', st: 'CAN_SHARE', note: '웹뷰랑 네이티브 브릿지 많이 짜봤어요', near: true, age: 56 },
  { id: 'taehyun', name: '태현', school: '부트캠프 수료', st: 'FIRST_TIME', note: '부트캠프 막 수료했어요. 현업 얘기 듣고 싶어요', near: false, age: 93 },
  { id: 'sua', name: '수아', school: '3년차', st: 'LOOKING_FOR', note: '사내 디자인 시스템 운영하시는 분 얘기 듣고 싶어요', near: false, age: 130 },
  { id: 'junho', name: '준호', school: '이직 준비', st: 'OPEN', note: '맥주 들고 있어요. 편하게 오세요', near: false, age: 167 },
  { id: 'p5', name: '지훈', school: '스타트업', st: 'LOOKING_FOR', note: 'Next.js 앱라우터 마이그레이션 해보신 분 계실까요', near: true, age: 204 },
  { id: 'p6', name: '하윤', school: '6년차', st: 'CAN_SHARE', note: '프론트 면접관 해봤어요. 궁금하시면', near: false, age: 241 },
  { id: 'p7', name: '서연', school: '취준', st: 'FIRST_TIME', note: '밋업 처음 와봐요. 어색하네요', near: false, age: 278 },
  { id: 'p8', name: '도윤', school: 'SI 3년차', st: 'OPEN', note: '뒤풀이 가실 분 계신가요', near: false, age: 33 },
  { id: 'p9', name: '지우', school: '2년차', st: 'LOOKING_FOR', note: '모노레포 turborepo 쓰시는 분', near: false, age: 70 },
  { id: 'p10', name: '은채', school: '5년차', st: 'CAN_SHARE', note: '성능 최적화로 LCP 절반 줄여본 적 있어요', near: true, age: 107 },
  { id: 'p11', name: '시우', school: '1년차', st: 'FIRST_TIME', note: '백엔드 하다가 프론트로 넘어온 지 두 달 됐어요', near: false, age: 144 },
  { id: 'p12', name: '나연', school: '프리랜서', st: 'CAN_SHARE', note: '주니어 멘토링 하고 있어요. 커리어 얘기 편하게', near: false, age: 181 },
  { id: 'p13', name: '건우', school: '7년차', st: 'LOOKING_FOR', note: '테스트 코드 문화 잡으신 팀 있나요', near: false, age: 218 },
  { id: 'p14', name: '유진', school: '취준', st: 'OPEN', note: '그냥 구경 중이에요. 말 걸어주세요', near: false, age: 255 },
  { id: 'p15', name: '채원', school: '4년차', st: 'CAN_SHARE', note: '사내에서 마이크로 프론트엔드 도입해봤어요', near: true, age: 10 },
  { id: 'p16', name: '현우', school: '이직 준비', st: 'LOOKING_FOR', note: '이직 고민 중인데 프론트 3년차 분들 계신가요', near: false, age: 47 },
  { id: 'p17', name: '다은', school: '2년차', st: 'FIRST_TIME', note: '혼자 와서 구석에 있어요', near: false, age: 84 },
  { id: 'p18', name: '정민', school: '스타트업', st: 'CAN_SHARE', note: '혼자 프론트 다 해요. 1인 개발 궁금하면 물어보세요', near: false, age: 121 },
  { id: 'p19', name: '소율', school: '3년차', st: 'OPEN', note: '입구 쪽에 서 있어요', near: false, age: 158 },
  { id: 'p20', name: '재현', school: '에이전시', st: 'LOOKING_FOR', note: '접근성 제대로 해보신 분 계신가요', near: true, age: 195 },
  { id: 'p21', name: '윤서', school: '5년차', st: 'CAN_SHARE', note: '리액트 네이티브 2년 했어요. 후회담 들려드릴게요', near: false, age: 232 },
];

// 뒤늦게 들어오는 사람들. 방이 멈춰 있지 않다는 걸 보여준다. (7단계 실시간 폴링에서 실제로 쓴다)
export const LATE = [
  { name: '채윤', school: '국민대', st: 'LOOKING_FOR', note: '지금 막 도착했어요. 팀 구하시는 분 계신가요', near: true },
  { name: '현재', school: '숭실대', st: 'OPEN', note: '늦게 와서 뒤쪽에 앉았어요', near: false },
  { name: '서진', school: '순천향대', st: 'CAN_SHARE', note: '방금 발표 끝났어요. 질문 있으면 받을게요', near: true },
  { name: '민규', school: '국민대', st: 'FIRST_TIME', note: '친구 따라왔는데 친구가 사라졌어요', near: false },
];

// ── 인메모리 저장. 새로고침하면 날아간다 — 실제 서버도 DB가 없으니 같은 성질이다 ──
const rooms = {}; // code -> { members: Map<id, member> }
function db(code) {
  if (!rooms[code]) rooms[code] = { members: new Map() };
  return rooms[code];
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let nextId = 1;

export async function getRoom(code) {
  const room = ROOMS[code];
  if (!room) throw new Error(`알 수 없는 방 코드: ${code}`);
  return { code, title: room.title, when: room.when, aff: room.aff };
}

export async function join(code, { nick, school, status, note }) {
  await delay(120);
  const id = `me${nextId++}`;
  const member = { id, name: nick, school, st: status, note, near: false, age: 0 };
  db(code).members.set(id, member);
  return member;
}

// 프로토타입의 saveStatus()는 수정 때도 닉네임·소속을 통째로 다시 받는다.
// 그 동작을 그대로 따라 여기서도 join()과 같은 전체 payload를 받는다.
export async function updateStatus(code, id, { nick, school, status, note }) {
  await delay(120);
  const member = { id, name: nick, school, st: status, note, near: false, age: 0 };
  db(code).members.set(id, member);
  return member;
}

export async function getMembers(code) {
  await delay(150);
  const room = ROOMS[code];
  // 시드 인원만. db(code).members는 "내가 제출한 기록"(join/updateStatus, id로
  // 조회) 저장소일 뿐 목록에 섞으면 안 된다 — 섞였을 때 헤드카운트가 46명이어야
  // 할 자리에 47명이 나오는 버그로 실기기에서 드러났다. 나 자신은 언제나
  // state.me로 별도 관리한다 (api/shapes.js 계약: "나를 제외한 목록").
  return room ? room.seed() : [];
}

/**
 * 접점 매칭. 실제 판단은 spec/prompts.md의 LLM 프롬프트가 한다 — 여기서는
 * "LOOKING_FOR인 사람에게 CAN_SHARE 한 명을 붙인다"만 흉내낸다.
 * 항상 같은 사람(민서)을 붙이는 건 프로토타입과 동일한 단순화다.
 */
export async function getMatch(code, id) {
  await delay(1500); // "N명 중에서 찾는 중" 문구가 보일 시간을 준다
  const room = db(code);
  const me = room.members.get(id);
  if (!me || me.st !== 'LOOKING_FOR') return null;
  const members = await getMembers(code);
  const helper = members.find((p) => p.st === 'CAN_SHARE');
  if (!helper) return null;
  return {
    personId: helper.id,
    // 두 표현이 다르다. leadSubject/leadDetail은 소개 문장용(명사구),
    // reasonMine/reasonTheirs는 "왜 이어드렸나" 도표용(절 형태). 실제로는 LLM이
    // 같은 판단을 두 형태로 풀어 쓴다 — spec/prompts.md 3번(첫마디 생성) 참고.
    leadSubject: '배포·CI 경험',
    leadDetail: '작년에 구축해보셨어요',
    reasonMine: '배포·CI 경험을 찾는 중',
    reasonTheirs: '작년에 CI 파이프라인 구축',
    overlapWords: 0,
    score: 0.85,
    opener: '혹시 CI 구축해보셨다고 들었어요. 저 지금 배포 권한에서 막혀 있는데요.',
  };
}

export async function heartbeat(_code, _id) {
  // 7단계(실시간)에서 60초 간격으로 실제 호출을 시작한다. 지금은 no-op
  return undefined;
}

/**
 * 운영진 대시보드. PRD F5가 명시적으로 숫자 하드코딩을 허용한다 — 발표에서
 * 화면 있음 + 근거만 있으면 되는 자리라, 진짜 집계는 7단계 실시간 폴링이
 * 붙은 뒤에 채운다. prototype 296~319줄 수치를 그대로 옮겼다.
 */
export async function getDashboard(_code) {
  await delay(150);
  return {
    joined: 47,
    capacity: 90,
    statusSet: 41,
    matched: 37,
    chatted: 24,
    topics: [
      { label: '배포·CI', count: 9 },
      { label: '서비스 기획', count: 6 },
      { label: '디자인 시스템', count: 4 },
      { label: '취업·이직', count: 3 },
    ],
  };
}
