// 기준선 A: 현재 브라우저 데모의 규칙 추천기를 그대로 옮긴 것.
// 원본: web/src/api/mock.js (ASKS / OFFERS / TOPICS / reason). 정규식과 주제 목록을 바꾸지 않는다.
//
// 적용 범위의 한계 (평가 해석 시 반드시 함께 읽는다):
//  1. 이 규칙은 '연결됨/안 됨'의 이진 판정만 한다. 후보 사이의 순서를 만들지 못한다.
//     평가에서는 판정된 후보에 동점 1.0을 주고 입력 순서로 동점을 깨므로, 이 기준선의 '순위'는
//     알고리즘의 판단이 아니라 입력에 들어온 순서 그대로다. 순위 비교에서 이 기준선의 패배는 '순위를 못 만든다'는
//     뜻이지 '정렬을 잘못했다'는 뜻이 아니다.
//  2. 교류 의도 충돌, 근거 부족과 부적합의 구분, 알림 적합성 정책이 없다.
//  3. 이유는 후보 자기소개 원문을 통째로 끼워 넣는 고정 문형이다. 조회 방향에 따라 달라지지 않고
//     길이 제한도 없다. 긴 한국어 입력에서는 그대로 길어진다.
import { assignRanks, emptyRecommendation, result } from './normalize.js';

const ASKS = /막히|막힌|막혀|막혔|모르|어렵|어려|헤매|궁금|찾|도움|필요|배우|알고 싶|보고 싶|익숙한 분|처음|계실까요|있나요|있을까요|주실|봐주|물어보|여쭤/;
const OFFERS = /해봤|해봅|구축|경험|자신|물어보셔도|물어봐 주|도와|알려|설명|봐드|나누|공유|잡아봤|통과시켜|만들어봤|할 줄|많이 했|오래 했|좀 합니다|드릴|드려|가능해|가능합/;
const TOPICS = [
  ['배포와 인프라', ['도커', 'CI', '배포', 'AWS', '빌드', '파이프라인', '서버', '인증', 'OAuth', 'Firebase', '권한']],
  ['프론트엔드', ['React', '리액트', '타입스크립트', '제네릭', '상태관리', '웹소켓', 'SSE', '소켓', '통신']],
  ['디자인', ['디자인', '피그마', '토큰', '일러스트', '아이콘', '프로토타입', '오토레이아웃']],
  ['기획과 제품', ['기획', 'PM', '기획서', '제품', '논문', 'NLP']],
  ['발표 준비', ['발표', '대본', '자료', '심사', '대회']],
  ['팀 구성', ['팀원', '팀 ', '팀이', '팀을']],
  ['첫 참가', ['처음', '비전공', '부트캠프', '편입', '1학년', '3학년', '구경', '익숙한', '분위기', '혼자', '아는 사람']],
  ['모바일', ['안드로이드', '앱 스토어', '스토어']],
  ['데이터', ['파이썬', '크롤링', '지도', 'API']],
  ['협업 도구', ['테스트', '깃', '충돌']],
];

const wrote = (p) => `${p.self_description} ${p.connection_intent}`;

function sharedTopic(viewer, candidate) {
  const mine = wrote(viewer);
  const theirs = wrote(candidate);
  const hit = TOPICS.find(([, words]) => words.some((w) => mine.includes(w)) && words.some((w) => theirs.includes(w)));
  return hit ? hit[0] : null;
}

export function runRuleBaseline(request) {
  const { viewer, candidates } = request;
  const recommendations = candidates.map((candidate) => {
    const complementary =
      (ASKS.test(wrote(viewer)) && OFFERS.test(wrote(candidate))) ||
      (OFFERS.test(wrote(viewer)) && ASKS.test(wrote(candidate)));
    const topic = complementary ? sharedTopic(viewer, candidate) : null;
    if (!topic) {
      // 원본은 'unscored'다. 근거 부족과 부적합을 구분하지 않으므로 가장 가까운 상태로만 옮긴다.
      return emptyRecommendation(candidate, viewer, { status: 'INSUFFICIENT_EVIDENCE' });
    }
    return emptyRecommendation(candidate, viewer, {
      status: 'EVALUATED',
      score: 1.0, // 이진 판정. 후보 간 우열이 없다.
      reason: `${candidate.nickname}님의 "${candidate.self_description}"가 지금 찾으시는 것과 맞아 보여요.`,
      excerpts: [
        {
          source: 'CANDIDATE_SELF_DESCRIPTION',
          quote: candidate.self_description,
          verified: true,
        },
      ],
      // 원본에 알림 정책이 없다. 판정된 후보를 모두 적합으로 보는 것이 이 기준선의 정책이다.
      notification_eligible: true,
      metadata_topic: topic,
    });
  });
  return result(request, assignRanks(recommendations), {
    policy_version: 'baseline-rule-mock@web/src/api/mock.js',
    model: null,
    anomalies: [],
  });
}
