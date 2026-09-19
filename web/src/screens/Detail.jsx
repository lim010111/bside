import { useRoom } from '../use-room.js';
import { validReason } from '../lib/contracts.js';
import { EmptyState, ErrorNotice, Loading, PageHeader, RecommendationRetry } from '../components/Feedback.jsx';

const reasonLabels = { pending: '추천 이유를 준비하고 있어요.', failed: '추천 이유를 불러오지 못했어요.', unscored: '아직 추천 이유가 없어요. 소개를 보고 직접 이야기를 나눠보세요.', unavailable: '지금은 추천할 수 없는 참가자예요.' };

export default function Detail() {
  const { state, actions } = useRoom();
  const { detail, detailLoading, detailError, me } = state;
  if (!detail) return <section className="screen"><PageHeader title="참가자 상세" onBack={() => actions.navigate('people')} />{detailLoading ? <Loading text="소개를 불러오고 있어요" /> : <ErrorNotice error={detailError} onRetry={actions.loadDetail} />}</section>;
  const { participant, recommendation } = detail;
  const stopped = me.participation_status === 'stopped' || participant.participation_status === 'stopped';
  const existing = state.conversations.find((c) => c.peer.id === participant.id);
  return <section className="screen detail-screen">
    <PageHeader title={participant.nickname} onBack={() => actions.navigate('people')} eyebrow="같은 행사 참가자" />
    <ErrorNotice error={detailError} onRetry={actions.loadDetail} />
    {participant.participation_status === 'stopped' && <p className="notice">이 분은 참여를 중단했어요. 새 메시지를 보낼 수 없어요.</p>}
    <div className="detail-section"><h2>자기소개</h2><p className="profile-text">{participant.self_description}</p></div>
    <div className="detail-section"><h2>찾는 사람</h2><p className="profile-text">{participant.connection_intent}</p></div>
    <aside className="why"><h2>왜 추천했나요?</h2>{validReason(detail, me) ? <p className="profile-text">{recommendation.reason}</p> : <p className="dim">{reasonLabels[recommendation?.state] ?? '추천 이유를 다시 확인하고 있어요.'}</p>}
      {recommendation?.state === 'failed' && <RecommendationRetry />}
    </aside>
    {me.participation_status === 'stopped' && <EmptyState compact title="참여를 재개하면 대화할 수 있어요" action={<button className="text-button" onClick={() => actions.navigate('profile')}>내 정보에서 재개하기</button>} />}
    <div className="bottom-action"><button className="btn" disabled={stopped && !existing} onClick={() => actions.navigate('chat', participant.id)}>{existing ? '이전 대화 보기' : stopped ? '지금은 대화할 수 없어요' : '대화 시작하기'}</button></div>
  </section>;
}
