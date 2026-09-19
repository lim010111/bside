import { useState } from 'react';
import { useRoom } from '../use-room.js';
import { orderParticipants } from '../lib/contracts.js';
import PersonCard from '../components/PersonCard.jsx';
import { EmptyState, ErrorNotice, Loading, PageHeader, Navigation, RecommendationRetry } from '../components/Feedback.jsx';

export default function Room() {
  const { state, actions } = useRoom();
  const [query, setQuery] = useState('');
  const { me, participants, recommendations, candidateVersion, recommendationState } = state;
  const ordered = orderParticipants(participants, recommendations, candidateVersion);
  const filtered = ordered.filter((p) => (p.nickname + ' ' + p.self_description).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const ranked = new Set(recommendations?.candidate_version === candidateVersion ? recommendations.ordered_evaluated_ids : []);
  return <section className="screen">
    <PageHeader title={state.room.name} eyebrow="Bside" action={<button className="text-button" onClick={() => actions.navigate('profile')}>내 정보</button>} />
    <Navigation />
    <button className="my-profile" onClick={() => actions.navigate('profile')}>
      <span className="section-head"><strong>{me.nickname}</strong><span className="dim">수정 <span aria-hidden="true">↗</span></span></span>
      <span className="clamp-two">{me.self_description}</span>
    </button>
    {me.participation_status === 'stopped' && <div className="notice"><p>참여를 중단한 상태예요. 기존 대화는 계속 볼 수 있어요.</p><button className="text-button" onClick={() => actions.navigate('profile')}>참여 재개하기</button></div>}
    <div className="section-head list-heading"><h2>같은 행사 사람들 <span className="dim">{participants.length}</span></h2><button className="text-button" onClick={actions.refreshAll} disabled={state.peopleLoading}>새로고침</button></div>
    <label className="sr-only" htmlFor="people-search">참가자 검색</label>
    <input id="people-search" type="search" className="field search" placeholder="이름이나 자기소개로 찾아보세요" value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className="recommendation-status" role="status">
      {recommendationState === 'pending' ? '추천을 준비하고 있어요. 먼저 둘러보세요.' :
        recommendationState === 'failed' ? '추천을 불러오지 못했어요. 모든 참가자는 볼 수 있어요.' :
        ranked.size ? '추천된 사람부터 보여드려요. 이유는 상세에서 확인하세요.' : '자기소개를 보고 편하게 대화를 시작해 보세요.'}
      {recommendationState === 'failed' && <RecommendationRetry />}
    </div>
    <ErrorNotice error={state.peopleError} onRetry={actions.refreshAll} />
    {state.peopleLoading && !participants.length ? <Loading text="참가자를 불러오고 있어요" /> :
      !state.peopleError && !participants.length ? <EmptyState title="첫 번째로 도착했어요" text="다른 참가자가 들어오면 여기에 표시돼요." /> :
      !filtered.length && participants.length ? <EmptyState title="검색 결과가 없어요" text="이름이나 다른 키워드로 찾아보세요." action={<button className="text-button" onClick={() => setQuery('')}>검색 지우기</button>} /> :
      <ul className="people-list">{filtered.map((person) => <li key={person.id}><PersonCard participant={person} ranked={ranked.has(person.id)} onOpen={(id) => actions.navigate('detail', id)} /></li>)}</ul>}
  </section>;
}
