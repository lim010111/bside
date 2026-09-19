// 목록 화면. prototype/구버전의 "방"이었던 자리 — 이제는 상태·근접·만료 없이
// "같은 행사 참가자 목록, 양쪽 의도에 따른 추천"만 한다(development-contract.md).
// 배너 순서는 recommendations가 정한다: 이유가 있는 사람 먼저, 나머지는 참여순.
import { useEffect } from 'react';
import { useRoom } from '../state.jsx';
import PersonCard from '../components/PersonCard.jsx';

export default function Room() {
  const {
    state, startEdit, loadParticipants, loadRecommendations, selectParticipant,
  } = useRoom();
  const { room, me, participants, recommendations, recommendationsLoading } = state;

  useEffect(() => {
    loadParticipants();
    loadRecommendations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!room || !me) return null;

  const byId = new Map(participants.map((p) => [p.id, p]));
  const ranked = recommendations
    .map((r) => ({ ...r, participant: byId.get(r.candidate_id) }))
    .filter((r) => r.participant);
  const rankedCount = ranked.filter((r) => r.state === 'ready').length;

  return (
    <section className="screen on">
      <header style={{ padding: '20px 0 14px' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h1 className="t-lg" style={{ margin: 0 }}>{room.title}</h1>
          <span className="t-sm dim">{participants.length + 1}명</span>
        </div>
      </header>

      <button type="button" className="section" style={{ width: '100%', textAlign: 'left' }} onClick={startEdit}>
        <div className="section-head">
          <span className="t-sm dim">내 정보</span>
          <span className="link">수정</span>
        </div>
        <p className="t-body wrap" style={{ marginTop: 7 }}>{me.self_description}</p>
        <p className="t-sm faint" style={{ marginTop: 5 }}>찾는 사람: {me.connection_intent}</p>
        {me.participation_status === 'stopped' && (
          <p className="t-sm" style={{ color: 'var(--danger)', marginTop: 7 }}>참여를 중단한 상태입니다. 목록에 안 보이고 새 메시지도 안 옵니다.</p>
        )}
      </button>

      <p className="t-sm dim" style={{ margin: '18px 2px 9px' }}>
        {recommendationsLoading ? '추천을 계산하는 중' : rankedCount > 0 ? `${rankedCount}명이 잘 맞을 것 같아요` : '같은 방 사람들'}
      </p>

      {ranked.length === 0 && !recommendationsLoading ? (
        <div className="empty">
          <svg className="ic"><use href="#i-inbox" /></svg>
          <p className="t-md" style={{ margin: 0 }}>아직 같은 방에 아무도 없어요</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 26 }}>
          {ranked.map((r) => (
            <PersonCard key={r.candidate_id} participant={r.participant} ranked={r.state === 'ready'} onOpen={selectParticipant} />
          ))}
        </div>
      )}
    </section>
  );
}
