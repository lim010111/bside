import { useDiscovery } from '../use-discovery.js';
import { eligibleForFirstMessage } from '../lib/contracts.js';
import { EmptyState, PageHeader } from '../components/Feedback.jsx';

export default function Detail() {
  const { state, actions } = useDiscovery();
  const { detail, me, targetId } = state;
  const existing = state.conversations.find((conversation) => conversation.participant.user_id === targetId);

  // v0.1 has no per-user endpoint. This screen reads the last observation response,
  // so "not here" means the person is not in that response any more.
  if (!detail) return <section className="screen">
    <PageHeader title={existing?.participant.profile.nickname ?? '상대 소개'} onBack={() => actions.navigate('nearby')} />
    <EmptyState title="지금은 주변에 없어요" text={existing ? '나눈 대화는 그대로 볼 수 있어요.' : '다시 가까워지면 주변 목록에 나타나요.'}
      action={existing
        ? <button className="btn btn-ghost" onClick={() => actions.navigate('chat', targetId)}>이전 대화 보기</button>
        : <button className="btn btn-ghost" onClick={() => actions.navigate('nearby')}>주변 목록으로</button>} />
  </section>;

  const { profile, recommendation } = detail;
  // The cached window is a hint for the screen. The server re-checks at save time.
  const eligible = me.discovery_enabled && eligibleForFirstMessage(detail);
  return <section className="screen detail-screen">
    <PageHeader title={profile.nickname} onBack={() => actions.navigate('nearby')} eyebrow="지금 주변에 있어요" />
    <div className="detail-section"><h2>자기소개</h2><p className="profile-text">{profile.self_description}</p></div>
    <div className="detail-section"><h2>만나고 싶은 사람</h2><p className="profile-text">{profile.connection_intent}</p></div>
    <aside className="why"><h2>왜 추천했나요?</h2>
      {recommendation?.status === 'ready' && recommendation.reason
        ? <p className="profile-text">{recommendation.reason}</p>
        : <p className="dim">AI 추천은 아직 준비 중이에요. 두 소개를 보고 직접 이야기를 시작해 보세요.</p>}
    </aside>
    {!existing && !eligible && <p className="notice" role="status">
      {me.discovery_enabled ? '관측이 만료돼 지금은 새 대화를 시작할 수 없어요.' : '주변 발견을 켜면 새 대화를 시작할 수 있어요.'}
    </p>}
    <div className="bottom-action">
      <button className="btn" disabled={!existing && !eligible} onClick={() => actions.navigate('chat', detail.user_id)}>
        {existing ? '이전 대화 보기' : '메시지 보내기'}
      </button>
    </div>
  </section>;
}
