import { useDiscovery } from '../use-discovery.js';
import { EmptyState, ErrorNotice, Loading, Navigation, PageHeader } from '../components/Feedback.jsx';

export default function Conversations() {
  const { state, actions } = useDiscovery();
  const nearby = new Set(state.people.map((person) => person.user_id));
  return <section className="screen">
    <PageHeader title="나눈 대화" eyebrow="Bside" action={<button className="text-button" onClick={actions.loadConversations}>새로고침</button>} />
    <Navigation />
    <ErrorNotice error={state.conversationsError} onRetry={actions.loadConversations} />
    {state.conversationsLoading && !state.conversations.length ? <Loading text="대화를 불러오고 있어요" /> :
      !state.conversations.length && !state.conversationsError ? <EmptyState title="아직 시작한 대화가 없어요" text="주변 사람의 소개를 보고 첫 인사를 건네보세요." action={<button className="btn btn-ghost" onClick={() => actions.navigate('nearby')}>주변 둘러보기</button>} /> :
      <ul className="people-list conversations-list">{state.conversations.map((conversation) => <li key={conversation.conversation_id}><button className="person" onClick={() => actions.navigate('chat', conversation.participant.user_id)}>
        <span className="section-head"><strong className="trunc">{conversation.participant.profile.nickname}</strong><time className="conversation-time" dateTime={conversation.last_message.created_at}>{messageTime(conversation.last_message.created_at)}</time></span>
        <span className="person-description clamp-two">{conversation.last_message.sender_id === state.me.user_id ? '나: ' : ''}{conversation.last_message.text}</span>
        {state.me.discovery_enabled && nearby.has(conversation.participant.user_id) && <span className="badge nearby-badge">지금 주변</span>}
      </button></li>)}</ul>}
  </section>;
}

function messageTime(value) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('ko-KR', { ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}), month: 'long', day: 'numeric' });
}
