import { useDiscovery } from '../use-discovery.js';
import { eligibleForFirstMessage } from '../lib/contracts.js';
import { EmptyState, PageHeader } from '../components/Feedback.jsx';

export default function Detail() {
  const { state, actions } = useDiscovery();
  const { detail, me, targetId } = state;
  const existing = state.conversations.find((conversation) => conversation.participant.user_id === targetId);

  // No per-user endpoint: missing observation data cannot prove someone left.
  if (!detail) return <section className="screen">
    <PageHeader title={existing?.participant.profile.nickname ?? '상대 소개'} onBack={actions.goBack} />
    <EmptyState title="소개를 확인할 수 없어요" text={me.discovery_enabled ? '최근 발견된 소개가 없어요. 다시 발견하면 여기서 볼 수 있어요.' : '주변 교류를 켜고 다시 발견하면 소개를 볼 수 있어요.'}
      action={existing
        ? <button className="btn btn-ghost" onClick={actions.goBack}>돌아가기</button>
        : <button className="btn btn-ghost" onClick={() => actions.navigate('nearby')}>주변 목록으로</button>} />
  </section>;

  const { profile, recommendation } = detail;
  // The cached window is a hint for the screen. The server re-checks at save time.
  const eligible = me.discovery_enabled && eligibleForFirstMessage(detail);
  return <section className="screen detail-screen">
    <PageHeader title={profile.nickname} onBack={actions.goBack} eyebrow="지금 주변에 있어요" />
    <div className="detail-section"><h2>자기소개</h2><p className="profile-text">{profile.self_description}</p></div>
    <div className="detail-section"><h2>만나고 싶은 사람</h2><p className="profile-text">{profile.connection_intent}</p></div>
    <aside className="why"><h2>{recommendation?.status === 'ready' ? '추천 이유' : '추천 안내'}</h2>
      {recommendation?.status === 'ready' && recommendation.reason
        ? <p className="profile-text">{recommendation.reason}</p>
        : <p className="dim">{recommendation?.status === 'pending'
          ? '소개에서 연결점을 찾고 있어요. 먼저 이야기를 시작해도 좋아요.'
          : recommendation?.status === 'unscored'
            ? '소개에서 뚜렷한 연결점을 찾지 못했어요. 직접 소개를 보고 이야기를 시작해 보세요.'
            : '지금은 추천 정보를 제공할 수 없어요. 소개를 보고 이야기를 시작해 보세요.'}</p>}
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
