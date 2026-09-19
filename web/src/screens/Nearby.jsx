import { useState } from 'react';
import { useDiscovery } from '../use-discovery.js';
import { needsRicherIntent, orderNearby } from '../lib/contracts.js';
import PersonCard from '../components/PersonCard.jsx';
import DiscoveryPanel from '../components/DiscoveryPanel.jsx';
import { EmptyState, ErrorNotice, Loading, PageHeader, Navigation } from '../components/Feedback.jsx';

export default function Nearby() {
  const { state, actions } = useDiscovery();
  const [query, setQuery] = useState('');
  const { me, people, native } = state;
  const ordered = orderNearby(people);
  const filtered = ordered.filter((person) => [person.profile.nickname, person.profile.self_description, person.profile.connection_intent].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const ranked = new Set(people.filter((person) => person.recommendation?.status === 'ready').map((person) => person.user_id));
  // 'pending' is an evaluation still running, not a missing feature. Saying it
  // is on the way is true; 'not ready yet' would not be.
  const evaluating = people.some((person) => person.recommendation?.status === 'pending');
  const noRadio = !native.supported;
  return <section className="screen">
    <PageHeader title="주변 사람들" eyebrow="Bside" action={<button className="text-button" onClick={() => actions.navigate('profile')}>내 정보</button>} />
    <Navigation />
    <DiscoveryPanel />
    {me.discovery_enabled && <>
    <div className="section-head list-heading"><h2>지금 가까이 <span className="dim">{people.length}</span></h2><button className="text-button" onClick={actions.refreshAll} disabled={state.nearbyLoading}>새로고침</button></div>
    {(people.length > 0 || query) && <><label className="sr-only" htmlFor="people-search">이름, 자기소개, 나누고 싶은 이야기로 검색</label>
    <input id="people-search" type="search" className="field search" placeholder="이름이나 나누고 싶은 이야기 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></>}
    {/* 준비되지 않은 것을 준비된 것처럼 적지 않는다. 평가 중과 추천 없음은 다른 상태다. */}
    {(ranked.size > 0 || evaluating) && <div className="recommendation-status" role="status">
      {ranked.size ? '추천된 사람부터 보여드려요.' : '추천을 준비하고 있어요. 먼저 소개를 둘러보세요.'}
    </div>}
    {/* AI-D2: 선택적 안내다. 목록과 채팅은 그대로 쓸 수 있고 추가 입력을 요구하지 않는다. */}
    {needsRicherIntent(people) && <p className="hint" role="status">
      어떤 이야기를 나누고 싶은지 한 가지 더 적으면 추천이 또렷해져요.
      <button className="text-button" onClick={() => actions.navigate('profile')}>내 소개 다듬기</button>
    </p>}
    <ErrorNotice error={state.nearbyError} onRetry={actions.refreshAll} />
    </>}
    {/* 신규 설치는 발견이 꺼진 채로 시작한다(계약). 그러니 여기서 켜는 것이 주 동작이다. */}
    {!me.discovery_enabled ? <>
      <EmptyState title="주변 교류가 꺼져 있어요" text="새로운 사람을 찾지 않아요. 기존 대화는 계속할 수 있어요." />
      <p className="discovery-explainer">참여를 켜면 주변 사람에게 내 소개가 보이고 새로운 대화를 시작할 수 있어요. 앱을 닫아도 직접 끌 때까지 참여가 유지돼요.</p>
    </> :
      noRadio ? <EmptyState title="이 화면에서는 주변을 찾을 수 없어요" text="주변 발견은 Android 앱의 Bluetooth 기능이에요. 앱에서 확인해 주세요." /> :
      state.nearbyLoading && !people.length ? <Loading text="주변을 찾고 있어요" /> :
      !state.nearbyError && !people.length ? <EmptyState title="아직 주변에 아무도 없어요" text="같은 공간에 참여자가 들어오면 여기에 표시돼요." /> :
      !filtered.length && people.length ? <EmptyState title="검색 결과가 없어요" text="이름이나 다른 키워드로 찾아보세요." action={<button className="text-button" onClick={() => setQuery('')}>검색 지우기</button>} /> :
      <ul className="people-list">{filtered.map((person) => <li key={person.user_id}><PersonCard person={person} ranked={ranked.has(person.user_id)} onOpen={(id) => actions.navigate('detail', id)} /></li>)}</ul>}
  </section>;
}
