// 목 구현. api/shapes.js·docs/api-contract.md의 모양을 따른다.
//
// 2026-09-19 전면 개편: 상태 선택 4종·소속·5분 만료·BLE·ends_at 자동 종료를
// 걷어내고 자기소개(self_description)+교류 의도(connection_intent) 자유 입력,
// 전체 참가자 순위, 운영자 수동 종료로 바꿨다. docs/development-contract.md 참고.
// 추천 로직은 하드코딩이다 — 실제 판단은 AI 담당(T03) 몫이고, 여기선 그 결과
// 모양만 흉내낸다. intent 문자열로 "찾는 것"/"줄 수 있는 것" 성향을 구분해서
// 대충 상보적으로 짝지어준다 — 완전한 순위 알고리즘이 아니다.

/* 행사마다 다른 것은 전부 여기 있다. 코드에 박지 않는다. */
export const ROOMS = {
  KOSS26: { title: '코쓱톤 네트워킹', seed: () => SEED_HACK },
  FEMEETUP: { title: '서울 프론트엔드 밋업', seed: () => SEED_MEET },
};

// intent 문자열 4종의 "성향" 태그. 화면에는 안 보인다 — mock 추천 계산 전용.
const NEEDS_HELP = '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요';
const CAN_HELP = '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요';

// 구체적인 한 줄. 뭉뚱그린 말은 가짜처럼 보인다.
// 방은 명단이 아니라 군중이다. 한 화면에 다 안 들어와야 추천이 값어치가 생긴다.
const SEED_HACK = [
  { id: 'minseo', name: '민서', school: '순천향대', self: '작년에 도커로 CI 파이프라인 구축해봤어요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: true, age: 40 },
  { id: 'yerin', name: '예린', school: '숭실대', self: 'React 상태관리로 삽질 오래 했어요. 물어보셔도 돼요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: true, age: 56 },
  { id: 'taehyun', name: '태현', school: '숭실대', self: '혼자 왔어요. 기획하다가 백엔드가 궁금해졌어요', intent: '이 자리에 익숙한 분이랑 얘기하면서 분위기를 좀 알고 싶어요', near: false, age: 93 },
  { id: 'sua', name: '수아', school: '국민대', self: '디자인 시스템 토큰 잡아보신 분 계실까요', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: false, age: 130 },
  { id: 'junho', name: '준호', school: '순천향대', self: '커피 들고 서 있어요. 아무나 오세요', intent: '꼭 정해진 주제 아니어도 편하게 대화할 사람이면 좋아요', near: false, age: 167 },
  { id: 'p5', name: '지훈', school: '국민대', self: '백엔드 한 분만 더 필요해요. 팀 아직 3명이에요', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: true, age: 204 },
  { id: 'p6', name: '하윤', school: '숭실대', self: '작년에 이 대회 나갔어요. 심사 분위기 궁금하면 물어보세요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: false, age: 241 },
  { id: 'p7', name: '서연', school: '국민대', self: '해커톤 처음이라 뭐부터 해야 할지 모르겠어요', intent: '이 자리에 익숙한 분이랑 얘기하면서 분위기를 좀 알고 싶어요', near: false, age: 278 },
  { id: 'p8', name: '도윤', school: '순천향대', self: '밥 같이 드실 분', intent: '꼭 정해진 주제 아니어도 편하게 대화할 사람이면 좋아요', near: false, age: 33 },
  { id: 'p9', name: '지우', school: '숭실대', self: '피그마 프로토타입까지 해보신 분 있나요', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: false, age: 70 },
  { id: 'p10', name: '은채', school: '국민대', self: '피그마 오토레이아웃은 좀 합니다', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: true, age: 107 },
  { id: 'p11', name: '시우', school: '순천향대', self: '1학년이고 아직 할 줄 아는 게 별로 없어요. 구경하러 왔어요', intent: '이 자리에 익숙한 분이랑 얘기하면서 분위기를 좀 알고 싶어요', near: false, age: 144 },
  { id: 'p12', name: '나연', school: '숭실대', self: 'AWS 프리티어로 배포까지 해봤어요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: false, age: 181 },
  { id: 'p13', name: '건우', school: '국민대', self: '안드로이드 빌드 에러 같이 봐주실 분', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: false, age: 218 },
  { id: 'p14', name: '유진', school: '순천향대', self: '자판기 앞에 있어요', intent: '꼭 정해진 주제 아니어도 편하게 대화할 사람이면 좋아요', near: false, age: 255 },
  { id: 'p15', name: '채원', school: '숭실대', self: '발표 많이 해봤어요. 대본 봐드릴 수 있어요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: true, age: 10 },
  { id: 'p16', name: '현우', school: '국민대', self: '소켓 통신 해보신 분 5분만 시간 내주실 수 있나요', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: false, age: 47 },
  { id: 'p17', name: '다은', school: '순천향대', self: '팀 없이 왔는데 괜찮을까요', intent: '이 자리에 익숙한 분이랑 얘기하면서 분위기를 좀 알고 싶어요', near: false, age: 84 },
  { id: 'p18', name: '정민', school: '숭실대', self: '타입스크립트 제네릭 헷갈리시면 오세요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: false, age: 121 },
  { id: 'p19', name: '소율', school: '국민대', self: '아무 얘기나 좋아요. 코딩 얘기 아니어도 됩니다', intent: '꼭 정해진 주제 아니어도 편하게 대화할 사람이면 좋아요', near: false, age: 158 },
  { id: 'p20', name: '재현', school: '순천향대', self: 'Firebase 인증 붙이다 막혔어요. 해보신 분', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: true, age: 195 },
  { id: 'p21', name: '윤서', school: '숭실대', self: '앱 스토어 심사 두 번 통과시켜봤습니다', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: false, age: 232 },
  { id: 'p22', name: '승현', school: '국민대', self: '학교에서 혼자 와서 아는 사람이 없네요', intent: '이 자리에 익숙한 분이랑 얘기하면서 분위기를 좀 알고 싶어요', near: false, age: 269 },
  { id: 'p23', name: '가은', school: '순천향대', self: '파이썬으로 크롤링 많이 해봤어요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: false, age: 24 },
  { id: 'p24', name: '준서', school: '숭실대', self: '발표 자료 만들어주실 분 급하게 찾습니다', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: false, age: 61 },
  { id: 'p25', name: '하은', school: '국민대', self: '노트북 충전 중이라 30분 묶여 있어요. 심심해요', intent: '꼭 정해진 주제 아니어도 편하게 대화할 사람이면 좋아요', near: true, age: 98 },
  { id: 'p26', name: '민재', school: '순천향대', self: 'PM 인턴 했었어요. 기획서 봐드릴게요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: false, age: 135 },
  { id: 'p27', name: '서윤', school: '숭실대', self: '디자인 전공인데 개발 쪽 어떻게 굴러가는지 보고 싶어요', intent: '이 자리에 익숙한 분이랑 얘기하면서 분위기를 좀 알고 싶어요', near: false, age: 172 },
  { id: 'p28', name: '지호', school: '국민대', self: '지도 API 써보신 분 계신가요. 카카오든 네이버든', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: false, age: 209 },
  { id: 'p29', name: '예준', school: '순천향대', self: '웹소켓이랑 SSE 둘 다 써봤어요. 차이 설명해드릴 수 있어요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: false, age: 246 },
  { id: 'p30', name: '수빈', school: '숭실대', self: '야식 뭐 시킬지 고민 중인데 같이 정하실 분', intent: '꼭 정해진 주제 아니어도 편하게 대화할 사람이면 좋아요', near: true, age: 283 },
  { id: 'p31', name: '동현', school: '국민대', self: 'OAuth 리다이렉트에서 계속 막힙니다', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: false, age: 38 },
  { id: 'p32', name: '아름', school: '순천향대', self: '비전공자예요. 코딩은 부트캠프에서 조금 배웠어요', intent: '이 자리에 익숙한 분이랑 얘기하면서 분위기를 좀 알고 싶어요', near: false, age: 75 },
  { id: 'p33', name: '성민', school: '숭실대', self: '일러스트 그릴 줄 알아요. 아이콘 필요하시면', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: false, age: 112 },
  { id: 'p34', name: '혜원', school: '국민대', self: '4층 창가에 있어요. 조용해요', intent: '꼭 정해진 주제 아니어도 편하게 대화할 사람이면 좋아요', near: false, age: 149 },
  { id: 'p35', name: '영진', school: '순천향대', self: '팀원 구해요. 기획 둘에 개발 하나라 개발자가 급해요', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: true, age: 186 },
  { id: 'p36', name: '지민', school: '숭실대', self: '깃 충돌 나면 불러주세요. 그건 자신 있어요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: false, age: 223 },
  { id: 'p37', name: '우진', school: '국민대', self: '편입생이라 아는 사람이 아예 없어요', intent: '이 자리에 익숙한 분이랑 얘기하면서 분위기를 좀 알고 싶어요', near: false, age: 260 },
  { id: 'p38', name: '보람', school: '순천향대', self: '논문 쪽 관심 있으면 얘기해요. NLP 랩 있었어요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: false, age: 15 },
  { id: 'p39', name: '태윤', school: '숭실대', self: '테스트 코드 어떻게 짜야 할지 감이 안 와요', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: false, age: 52 },
  { id: 'p40', name: '세연', school: '국민대', self: '담배 피우러 나갈 건데 같이 가실 분', intent: '꼭 정해진 주제 아니어도 편하게 대화할 사람이면 좋아요', near: true, age: 89 },
  { id: 'p41', name: '규민', school: '순천향대', self: '작년에 신청했다가 못 왔어요. 올해가 처음이에요', intent: '이 자리에 익숙한 분이랑 얘기하면서 분위기를 좀 알고 싶어요', near: false, age: 126 },
  { id: 'p42', name: '하영', school: '숭실대', self: '디자인 툴은 웬만한 거 다 써봤어요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: false, age: 163 },
  { id: 'p43', name: '진우', school: '국민대', self: '발표 대본 같이 봐주실 분 있을까요', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: false, age: 200 },
  { id: 'p44', name: '예은', school: '순천향대', self: '3학년인데 이런 거 한 번도 안 해봤어요', intent: '이 자리에 익숙한 분이랑 얘기하면서 분위기를 좀 알고 싶어요', near: false, age: 237 },
];

// 같은 코드가 다른 행사를 돌린다. 밋업은 소속이 학교가 아니라 회사다.
const SEED_MEET = [
  { id: 'minseo', name: '민서', school: '4년차', self: '디자인 시스템 2년째 운영 중이에요. 삽질 얘기 해드릴게요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: true, age: 40 },
  { id: 'yerin', name: '예린', school: '프리랜서', self: '웹뷰랑 네이티브 브릿지 많이 짜봤어요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: true, age: 56 },
  { id: 'taehyun', name: '태현', school: '부트캠프 수료', self: '부트캠프 막 수료했어요. 현업 얘기 듣고 싶어요', intent: '이 자리에 익숙한 분이랑 얘기하면서 분위기를 좀 알고 싶어요', near: false, age: 93 },
  { id: 'sua', name: '수아', school: '3년차', self: '사내 디자인 시스템 운영하시는 분 얘기 듣고 싶어요', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: false, age: 130 },
  { id: 'junho', name: '준호', school: '이직 준비', self: '맥주 들고 있어요. 편하게 오세요', intent: '꼭 정해진 주제 아니어도 편하게 대화할 사람이면 좋아요', near: false, age: 167 },
  { id: 'p5', name: '지훈', school: '스타트업', self: 'Next.js 앱라우터 마이그레이션 해보신 분 계실까요', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: true, age: 204 },
  { id: 'p6', name: '하윤', school: '6년차', self: '프론트 면접관 해봤어요. 궁금하시면', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: false, age: 241 },
  { id: 'p7', name: '서연', school: '취준', self: '밋업 처음 와봐요. 어색하네요', intent: '이 자리에 익숙한 분이랑 얘기하면서 분위기를 좀 알고 싶어요', near: false, age: 278 },
  { id: 'p8', name: '도윤', school: 'SI 3년차', self: '뒤풀이 가실 분 계신가요', intent: '꼭 정해진 주제 아니어도 편하게 대화할 사람이면 좋아요', near: false, age: 33 },
  { id: 'p9', name: '지우', school: '2년차', self: '모노레포 turborepo 쓰시는 분', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: false, age: 70 },
  { id: 'p10', name: '은채', school: '5년차', self: '성능 최적화로 LCP 절반 줄여본 적 있어요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: true, age: 107 },
  { id: 'p11', name: '시우', school: '1년차', self: '백엔드 하다가 프론트로 넘어온 지 두 달 됐어요', intent: '이 자리에 익숙한 분이랑 얘기하면서 분위기를 좀 알고 싶어요', near: false, age: 144 },
  { id: 'p12', name: '나연', school: '프리랜서', self: '주니어 멘토링 하고 있어요. 커리어 얘기 편하게', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: false, age: 181 },
  { id: 'p13', name: '건우', school: '7년차', self: '테스트 코드 문화 잡으신 팀 있나요', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: false, age: 218 },
  { id: 'p14', name: '유진', school: '취준', self: '그냥 구경 중이에요. 말 걸어주세요', intent: '꼭 정해진 주제 아니어도 편하게 대화할 사람이면 좋아요', near: false, age: 255 },
  { id: 'p15', name: '채원', school: '4년차', self: '사내에서 마이크로 프론트엔드 도입해봤어요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: true, age: 10 },
  { id: 'p16', name: '현우', school: '이직 준비', self: '이직 고민 중인데 프론트 3년차 분들 계신가요', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: false, age: 47 },
  { id: 'p17', name: '다은', school: '2년차', self: '혼자 와서 구석에 있어요', intent: '이 자리에 익숙한 분이랑 얘기하면서 분위기를 좀 알고 싶어요', near: false, age: 84 },
  { id: 'p18', name: '정민', school: '스타트업', self: '혼자 프론트 다 해요. 1인 개발 궁금하면 물어보세요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: false, age: 121 },
  { id: 'p19', name: '소율', school: '3년차', self: '입구 쪽에 서 있어요', intent: '꼭 정해진 주제 아니어도 편하게 대화할 사람이면 좋아요', near: false, age: 158 },
  { id: 'p20', name: '재현', school: '에이전시', self: '접근성 제대로 해보신 분 계신가요', intent: '지금 막힌 걸 같이 풀어줄 수 있는 분과 편하게 얘기하고 싶어요', near: true, age: 195 },
  { id: 'p21', name: '윤서', school: '5년차', self: '리액트 네이티브 2년 했어요. 후회담 들려드릴게요', intent: '비슷한 걸 겪고 있거나 막힌 분이 있으면 편하게 물어봐 주세요', near: false, age: 232 },
];

// 뒤늦게 들어오는 사람들. 방이 멈춰 있지 않다는 걸 보여준다. (T02 실시간 폴링 붙으면 쓴다)
export const LATE = [
  { name: '채윤', self: '지금 막 도착했어요. 팀 구하시는 분 계신가요', intent: NEEDS_HELP },
  { name: '현재', self: '늦게 와서 뒤쪽에 앉았어요', intent: '꼭 정해진 주제 아니어도 편하게 대화할 사람이면 좋아요' },
  { name: '서진', self: '방금 발표 끝났어요. 질문 있으면 받을게요', intent: CAN_HELP },
  { name: '민규', self: '친구 따라왔는데 친구가 사라졌어요', intent: '이 자리에 익숙한 분이랑 얘기하면서 분위기를 좀 알고 싶어요' },
];

// ── 저장소. sessionStorage 위에 얹은 흉내다 ──
//
// 진짜 서버는 브라우저 새로고침에 안 죽는다 — 서버 프로세스는 계속 떠 있고
// "서버 재시작"이라는 완전히 다른 사건이 나야 메모리가 지워진다. 그런데 이
// mock은 서버와 브라우저가 같은 JS 런타임이라, rooms를 그냥 변수로만 두면
// 새로고침 = 서버 재시작이 되어버려서 세션 복원(getMe)을 테스트할 수 없다.
// sessionStorage에 같이 적어서 "새로고침엔 살고 탭을 닫으면 죽는다"는 진짜
// 서버-클라이언트 관계를 흉내 낸다. 영속 쿠키(새 계약)까지는 아니고 세션
// 수준이지만, 지금 우선순위는 "화면 흐름이 새 계약을 따라가는가"다 — 실제
// 쿠키 수명은 T02(서버)가 정한다. client.js(T05)로 가면 이 파일은 안 쓰인다.
const DB_KEY = 'bside:mock:rooms';
function loadRooms() {
  try { return JSON.parse(sessionStorage.getItem(DB_KEY)) || {}; } catch { return {}; }
}
function saveRooms() { try { sessionStorage.setItem(DB_KEY, JSON.stringify(rooms)); } catch { /* noop */ } }
const rooms = loadRooms(); // code -> { members: { [id]: participant }, status: 'open'|'closed' }
function db(code) {
  if (!rooms[code]) rooms[code] = { members: {}, status: 'open' };
  return rooms[code];
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let nextId = Number(sessionStorage.getItem('bside:mock:nextId') || 1);
function issueId() {
  const id = `me${nextId++}`;
  sessionStorage.setItem('bside:mock:nextId', String(nextId));
  return id;
}

export async function getRoom(code) {
  const room = ROOMS[code];
  if (!room) throw new Error(`알 수 없는 방 코드: ${code}`);
  const status = db(code).status;
  return { code, title: room.title, status, closedAt: status === 'closed' ? new Date().toISOString() : null };
}

/** 운영자 수동 종료. 데모/테스트 전용 — 실제 화면엔 이걸 누를 UI가 없다(운영 도구 몫) */
export async function closeRoom(code) {
  db(code).status = 'closed';
  saveRooms();
}

export async function join(code, { nickname, self_description, connection_intent }) {
  await delay(120);
  const id = issueId();
  const member = {
    id, nickname, self_description, connection_intent,
    participation_status: 'active', profile_version: 1,
    joined_at: new Date().toISOString(),
  };
  db(code).members[id] = member;
  saveRooms();
  return member;
}

export async function updateMe(code, id, { self_description, connection_intent }) {
  await delay(120);
  const prev = db(code).members[id];
  if (!prev) throw new Error('참가자를 찾을 수 없다');
  const member = { ...prev, self_description, connection_intent, profile_version: prev.profile_version + 1 };
  db(code).members[id] = member;
  saveRooms();
  return member;
}

export async function stop(code, id) {
  await delay(100);
  const prev = db(code).members[id];
  const member = { ...prev, participation_status: 'stopped' };
  db(code).members[id] = member; saveRooms();
  return member;
}

export async function resume(code, id) {
  await delay(100);
  const prev = db(code).members[id];
  const member = { ...prev, participation_status: 'active' };
  db(code).members[id] = member; saveRooms();
  return member;
}

/** 새로고침 복원. sessionStorage에 남은 id로 "나 아직 유효해?"를 묻는다. 영속 세션 — 만료 없음 */
export async function getMe(code, id) {
  await delay(100);
  if (!id) return null;
  return db(code).members[id] || null;
}

// 시드 배열은 self/intent라는 축약 키를 쓴다(위 SEED_HACK 데이터). join()으로
// 실제 들어온 사람은 self_description/connection_intent(계약 필드명)를 쓴다.
// 여기서 하나로 맞춘다 — 화면 코드는 항상 계약 필드명만 본다.
function normalize(p) {
  if (p.self_description !== undefined) return p; // 이미 계약 필드명
  return {
    id: p.id, nickname: p.name,
    self_description: p.self, connection_intent: p.intent,
    participation_status: 'active', profile_version: 1,
    joined_at: new Date(Date.now() - (p.age ?? 0) * 1000).toISOString(),
  };
}

/** 나를 제외한, 참여 중(active)인 참가자 전체. 순위 없는 날것의 목록 */
export async function getParticipants(code, viewerId) {
  await delay(150);
  const room = ROOMS[code];
  const seeded = (room ? room.seed() : []).map(normalize);
  const joined = Object.values(db(code).members).filter((m) => m.id !== viewerId);
  return [...seeded, ...joined].filter((p) => (p.participation_status ?? 'active') === 'active');
}

/**
 * 상보성 추천 이유. 실제 판단은 AI 담당(T03) 몫이고 spec/prompts.md에 프롬프트가
 * 있다 — 여기선 텍스트에 든 키워드로 "도움이 필요한 사람"↔"도와줄 수 있는 사람"을
 * 대충 가른다. 정확한 문자열 일치가 아니라 키워드 검사인 이유: 시드 데이터가 아닌
 * 실제 사용자가 자유롭게 쓴 문장은 절대 시드 문구와 토씨 하나 안 틀리고 같을 수
 * 없다 — 정확 일치로 짰다가 실사용에서 항상 추천 0건만 나오는 걸 실기기로 잡았다.
 */
const NEEDS_PAT = /막히|막혔|막혀|모르겠|어려|헤매|찾고 있|찾아요|도와|도움|궁금|해보신 분|계실까요|있나요|있을까요|급하게/;
const HELPS_PAT = /해봤|구축|경험|자신 있|해결|해드릴|물어보셔도|물어봐 주세요|잡아봤|통과시켜|줄여본|만들어봤|해봅니다|합니다/;

function reasonFor(viewer, candidate) {
  if (!viewer || !candidate) return null;
  const viewerText = `${viewer.self_description} ${viewer.connection_intent}`;
  const candidateText = `${candidate.self_description} ${candidate.connection_intent}`;
  if (NEEDS_PAT.test(viewerText) && HELPS_PAT.test(candidateText)) {
    return `${candidate.nickname}님의 "${candidate.self_description}"가 지금 찾으시는 도움과 맞아 보여요.`;
  }
  return null;
}

/** 순위 목록. 이유가 있는 사람이 먼저, 없는 사람은 참여 순서(joined_at)로 뒤에 */
export async function getRecommendations(code, viewerId) {
  await delay(600);
  const viewer = db(code).members[viewerId];
  const all = await getParticipants(code, viewerId);
  const withReason = [];
  const rest = [];
  for (const p of all) {
    const reason = reasonFor(viewer, p);
    (reason ? withReason : rest).push({ candidate_id: p.id, reason, state: reason ? 'ready' : 'unscored' });
  }
  return [...withReason, ...rest];
}

export async function getParticipant(code, viewerId, targetId) {
  await delay(150);
  const all = await getParticipants(code, viewerId);
  const participant = all.find((p) => p.id === targetId) ?? Object.values(db(code).members).find((m) => m.id === targetId);
  if (!participant) return null;
  const viewer = db(code).members[viewerId];
  const reason = reasonFor(viewer, participant);
  return { participant, recommendation: { candidate_id: targetId, reason, state: reason ? 'ready' : 'unscored' } };
}

export async function heartbeat(_code, _id) {
  return undefined;
}

/**
 * 운영진 대시보드. team-plan.md가 "개발 작업으로 배정하지 않는다"고 명시했다 —
 * 우선순위 아님. 화면은 남겨두되 숫자는 그대로 하드코딩(예전 코드 그대로).
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
