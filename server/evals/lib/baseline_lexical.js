// 기준선 B: 평가를 위해 따로 정의한 단순 결정론적 기준선. 기존 mock과 무관하다.
//
// 명세 (이 정의가 전부다. 학습·조정·난수 없음):
//  점수 = 0.7 * 자소 2-gram 코사인 유사도(조회자 전체 원문 vs 후보 전체 원문)
//       + 0.3 * 방향 보너스(조회자가 요청형이고 후보가 제공형이면 1, 반대도 1, 아니면 0)
//  2-gram 은 공백·문장부호를 제거한 문자열에서 만든다. 토크나이저나 사전을 쓰지 않는다.
//  점수 0.08 미만이면 INSUFFICIENT_EVIDENCE, 그 외 EVALUATED. 임계값은 고정 상수다.
//  이유는 후보 원문에서 조회자 원문과 2-gram 이 가장 많이 겹치는 한 문장을 그대로 인용한다.
//  알림 적합 기준은 점수 0.35 이상 그리고 1순위. 의도 충돌은 판단하지 않는다(항상 false).
//
// 한계: 의미가 아니라 글자 겹침만 본다. 어휘가 다른 상보성(H03 발표 사례)은 원리상 잡지 못하고,
//       의도 충돌(E04/H04)도 표현이 비슷하면 오히려 점수가 올라간다. 이 기준선의 목적은
//       '문자열 유사도만으로 어디까지 되는가'의 하한선을 고정하는 것이다.
import { assignRanks, emptyRecommendation, result } from './normalize.js';

const ASK = /막히|막힌|막혀|막혔|모르|어렵|어려|헤매|궁금|찾고|찾습|찾아|도움|필요|배우|알고 싶|여쭤|물어보고|봐주실|봐주시|처음|구하고/;
const OFFER = /해봤|했어요|했습니다|구축|경험|운영|관리|도와|알려|설명|봐드|나누|공유|드릴|드려|가능|잡습|봐드릴|물어봐 주/;
const SCORE_FLOOR = 0.08;
const NOTIFY_FLOOR = 0.35;

const clean = (s) => s.replace(/[\s.,!?~'"“”‘’()\[\]/:;]/g, '');

function bigrams(text) {
  const t = clean(text);
  const counts = new Map();
  for (let i = 0; i + 1 < t.length; i += 1) {
    const g = t.slice(i, i + 2);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return counts;
}

function cosine(a, b) {
  let dot = 0;
  for (const [g, n] of a) dot += n * (b.get(g) ?? 0);
  const norm = (m) => Math.sqrt([...m.values()].reduce((s, n) => s + n * n, 0));
  const d = norm(a) * norm(b);
  return d === 0 ? 0 : dot / d;
}

const wrote = (p) => `${p.self_description} ${p.connection_intent}`;

/**
 * 인용할 문장과 **그 문장이 실제로 나온 필드**를 함께 돌려준다.
 *
 * 이전에는 자기소개와 교류 의도를 합친 글에서 문장을 고르면서 출처를 늘 자기소개로 적었다.
 * 교류 의도에서 고른 문장이 자기소개 인용으로 표시돼 근거 검사에서 떨어졌다. 이는 기준선의
 * 표기 결함이지 판단력의 차이가 아니므로, 점수·가중치·임계값은 건드리지 않고 표기만 고친다.
 */
function bestSentence(candidate, viewerGrams) {
  const fields = [
    ['CANDIDATE_SELF_DESCRIPTION', candidate.self_description],
    ['CANDIDATE_CONNECTION_INTENT', candidate.connection_intent],
  ];
  let best = { quote: candidate.self_description, source: 'CANDIDATE_SELF_DESCRIPTION' };
  let bestScore = -1;
  for (const [source, text] of fields) {
    for (const sentence of (text ?? '').split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean)) {
      const score = cosine(bigrams(sentence), viewerGrams);
      if (score > bestScore) {
        bestScore = score;
        best = { quote: sentence, source };
      }
    }
  }
  return best;
}

export function runLexicalBaseline(request) {
  const { viewer, candidates } = request;
  const viewerText = wrote(viewer);
  const viewerGrams = bigrams(viewerText);
  const viewerAsks = ASK.test(viewerText);
  const viewerOffers = OFFER.test(viewerText);

  const recommendations = candidates.map((candidate) => {
    const candidateText = wrote(candidate);
    const similarity = cosine(viewerGrams, bigrams(candidateText));
    const direction =
      (viewerAsks && OFFER.test(candidateText)) || (viewerOffers && ASK.test(candidateText)) ? 1 : 0;
    const score = 0.7 * similarity + 0.3 * direction;
    if (score < SCORE_FLOOR) {
      return emptyRecommendation(candidate, viewer, { status: 'INSUFFICIENT_EVIDENCE', score });
    }
    const { quote, source } = bestSentence(candidate, viewerGrams);
    const sourceText = source === 'CANDIDATE_SELF_DESCRIPTION' ? candidate.self_description : candidate.connection_intent;
    return emptyRecommendation(candidate, viewer, {
      status: 'EVALUATED',
      score,
      reason: `${candidate.nickname}님이 "${quote}"라고 적으셨어요.`,
      excerpts: [{ source, quote, verified: (sourceText ?? '').includes(quote) }],
      notification_eligible: false, // 순위 확정 후 채운다
    });
  });

  assignRanks(recommendations);
  for (const r of recommendations) {
    r.notification_eligible = r.status === 'EVALUATED' && r.rank === 1 && r.score >= NOTIFY_FLOOR;
  }
  return result(request, recommendations, {
    policy_version: 'baseline-lexical-bigram@v1',
    model: null,
  });
}
