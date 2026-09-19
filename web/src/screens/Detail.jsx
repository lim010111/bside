import { useDiscovery } from '../use-discovery.js';
import { validReason } from '../lib/contracts.js';
import { EmptyState, ErrorNotice, Loading, PageHeader, RecommendationRetry } from '../components/Feedback.jsx';

const reasonLabels = {
  pending: '추천 이유를 준비하고 있어요.',
  failed: '추천 이유를 불러오지 못했어요.',
  unscored: '아직 추천 이유가 없어요. 소개를 보고 직접 이야기를 나눠보세요.',
};

export default function Detail() {
  const { state, actions } = useDiscovery();
  const { detail, detailLoading, detailError, me, targetId } = state;
  const existing = state.conversations.find((conversation) => conversation.peer.id === targetId);

  if (!detail) {
    // 관측이 만료됐거나 상대가 발견을 껐다. 현재 상태를 말하고, 이미 있는 대화는 그대로 연다.
    const gone = ['OBSERVATION_EXPIRED', 'DISCOVERY_OFF'].includes(detailError?.code);
    return <section className="screen">
      <PageHeader title={existing?.peer.nickname ?? '상대 소개'} onBack={() => actions.navigate('nearby')} />
      {detailLoading ? <Loading text="소개를 불러오고 있어요" /> :
        gone ? <EmptyState title="지금은 주변에 없어요" text={existing ? '나눈 대화는 그대로 볼 수 있어요.' : '다시 가까워지면 주변 목록에 나타나요.'}
          action={existing
            ? <button className="btn btn-ghost" onClick={() => actions.navigate('chat', targetId)}>이전 대화 보기</button>
            : <button className="btn btn-ghost" onClick={() => actions.navigate('nearby')}>주변 목록으로</button>} /> :
        <ErrorNotice error={detailError} onRetry={actions.loadDetail} />}
    </section>;
  }

  const { person, recommendation } = detail;
  const canStart = Boolean(me.discovery_enabled);
  return <section className="screen detail-screen">
    <PageHeader title={person.nickname} onBack={() => actions.navigate('nearby')} eyebrow="지금 주변에 있어요" />
    <ErrorNotice error={detailError} onRetry={actions.loadDetail} />
    <div className="detail-section"><h2>자기소개</h2><p className="profile-text">{person.self_description}</p></div>
    <div className="detail-section"><h2>만나고 싶은 사람</h2><p className="profile-text">{person.connection_intent}</p></div>
    <aside className="why"><h2>왜 추천했나요?</h2>
      {validReason(detail, me)
        ? <p className="profile-text">{recommendation.reason}</p>
        : <p className="dim">{reasonLabels[recommendation?.state] ?? '추천 이유를 다시 확인하고 있어요.'}</p>}
      {recommendation?.state === 'failed' && <RecommendationRetry />}
      {/* AI-D2: 선택적 보완 안내. 이 화면의 대화 시작을 막지 않는다. */}
      {recommendation?.state === 'unscored' && <button className="text-button" onClick={() => actions.navigate('profile')}>내 소개 다듬기</button>}
    </aside>
    {!canStart && !existing && <p className="notice" role="status">주변 발견을 켜면 새 대화를 시작할 수 있어요.</p>}
    <div className="bottom-action">
      <button className="btn" disabled={!existing && !canStart} onClick={() => actions.navigate('chat', person.id)}>
        {existing ? '이전 대화 보기' : '메시지 보내기'}
      </button>
    </div>
  </section>;
}
