import { useDiscovery } from '../use-discovery.js';
import { EmptyState, ErrorNotice, Loading, Navigation, PageHeader } from '../components/Feedback.jsx';

export default function Conversations() {
  const { state, actions } = useDiscovery();
  return <section className="screen">
    <PageHeader title="나눈 대화" eyebrow="Bside" action={<button className="text-button" onClick={actions.loadConversations}>새로고침</button>} />
    <Navigation />
    <ErrorNotice error={state.conversationsError} onRetry={actions.loadConversations} />
    {state.conversationsLoading && !state.conversations.length ? <Loading text="대화를 불러오고 있어요" /> :
      !state.conversations.length && !state.conversationsError ? <EmptyState title="아직 시작한 대화가 없어요" text="주변 사람의 소개를 보고 첫 인사를 건네보세요." action={<button className="btn btn-ghost" onClick={() => actions.navigate('nearby')}>주변 둘러보기</button>} /> :
      <ul className="people-list conversations-list">{state.conversations.map((conversation) => <li key={conversation.id}><button className="person" onClick={() => actions.navigate('chat', conversation.peer.id)}>
        {/* 근접 이탈은 대화가 끝난 게 아니다. 지금 가까이 있는지만 알려준다. */}
        <span className="section-head"><strong className="trunc">{conversation.peer.nickname}</strong>{!conversation.peer_nearby && <span className="badge">주변에 없음</span>}</span>
        <span className="person-description clamp-two">{conversation.last_message?.sender_id === state.me.user_id ? '나: ' : ''}{conversation.last_message?.text ?? '대화를 이어가세요'}</span>
      </button></li>)}</ul>}
  </section>;
}
