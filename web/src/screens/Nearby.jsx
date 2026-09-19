import { useState } from 'react';
import { useDiscovery } from '../use-discovery.js';
import { needsRicherIntent, orderNearby } from '../lib/contracts.js';
import PersonCard from '../components/PersonCard.jsx';
import DiscoveryPanel from '../components/DiscoveryPanel.jsx';
import { EmptyState, ErrorNotice, Loading, PageHeader, Navigation, RecommendationRetry } from '../components/Feedback.jsx';

export default function Nearby() {
  const { state, actions } = useDiscovery();
  const [query, setQuery] = useState('');
  const { me, people, recommendations, nearbyVersion, recommendationState } = state;
  const ordered = orderNearby(people, recommendations, nearbyVersion);
  const filtered = ordered.filter((person) => (person.nickname + ' ' + person.self_description).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const ranked = new Set(recommendations?.nearby_version === nearbyVersion ? recommendations.ordered_evaluated_ids : []);
  return <section className="screen">
    <PageHeader title="주변 사람들" eyebrow="Bside" action={<button className="text-button" onClick={() => actions.navigate('profile')}>내 정보</button>} />
    <Navigation />
    <button className="my-profile" onClick={() => actions.navigate('profile')}>
      <span className="section-head"><strong>{me.nickname}</strong><span className="dim">수정 <span aria-hidden="true">↗</span></span></span>
      <span className="clamp-two">{me.self_description}</span>
    </button>
    <DiscoveryPanel />
    <div className="section-head list-heading"><h2>지금 가까이 <span className="dim">{people.length}</span></h2><button className="text-button" onClick={actions.refreshAll} disabled={state.nearbyLoading}>새로고침</button></div>
    <label className="sr-only" htmlFor="people-search">주변 사람 검색</label>
    <input id="people-search" type="search" className="field search" placeholder="이름이나 자기소개로 찾아보세요" value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className="recommendation-status" role="status">
      {recommendationState === 'pending' ? '추천을 준비하고 있어요. 먼저 둘러보세요.' :
        recommendationState === 'failed' ? '추천을 불러오지 못했어요. 주변 사람은 모두 볼 수 있어요.' :
        ranked.size ? '추천된 사람부터 보여드려요. 이유는 상세에서 확인하세요.' : '자기소개를 보고 편하게 대화를 시작해 보세요.'}
      {recommendationState === 'failed' && <RecommendationRetry />}
    </div>
    {/* AI-D2: 선택적 안내다. 목록과 채팅은 그대로 쓸 수 있고 추가 입력을 요구하지 않는다. */}
    {needsRicherIntent(people) && <p className="hint" role="status">
      어떤 이야기를 나누고 싶은지 한 가지 더 적으면 추천이 또렷해져요.
      <button className="text-button" onClick={() => actions.navigate('profile')}>내 소개 다듬기</button>
    </p>}
    <ErrorNotice error={state.nearbyError} onRetry={actions.refreshAll} />
    {!me.discovery_enabled ? <EmptyState title="주변 발견이 꺼져 있어요" text="켜면 가까이 있는 사람을 다시 찾아요. 나눈 대화는 그대로 있어요."
      action={<button className="btn btn-ghost" onClick={() => actions.navigate('conversations')}>대화 보러 가기</button>} /> :
      state.nearbyLoading && !people.length ? <Loading text="주변을 찾고 있어요" /> :
      !state.nearbyError && !people.length ? <EmptyState title="아직 주변에 아무도 없어요" text="같은 공간에 참여자가 들어오면 여기에 표시돼요." /> :
      !filtered.length && people.length ? <EmptyState title="검색 결과가 없어요" text="이름이나 다른 키워드로 찾아보세요." action={<button className="text-button" onClick={() => setQuery('')}>검색 지우기</button>} /> :
      <ul className="people-list">{filtered.map((person) => <li key={person.id}><PersonCard person={person} ranked={ranked.has(person.id)} onOpen={(id) => actions.navigate('detail', id)} /></li>)}</ul>}
  </section>;
}
