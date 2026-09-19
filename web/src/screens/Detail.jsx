// 참가자 상세. "배너를 눌러 이동. 자기소개·그 사용자가 찾는 사람·현재 조회자를
// 위한 추천 이유·채팅 시작 동작"(development-contract.md). 접점 시트가 하던
// "여기만 손이 더 갔다" 역할을 이제 이 화면이 맡는다 — 근거 블록은 그대로 재사용.
import { useRoom } from '../state.jsx';

export default function Detail() {
  const { state, deselectParticipant, openChat } = useRoom();
  const { selected } = state;

  if (!selected) return null;
  const { participant, recommendation } = selected;
  const stopped = participant.participation_status === 'stopped';

  return (
    <section className="screen on">
      <header className="row" style={{ padding: '18px 0 12px', gap: 10 }}>
        <button type="button" onClick={deselectParticipant} aria-label="뒤로" style={{ width: 32, height: 44, display: 'flex', alignItems: 'center' }}>
          <svg className="ic lg"><use href="#i-back" /></svg>
        </button>
        <h1 className="t-lg" style={{ margin: 0 }}>{participant.nickname}</h1>
      </header>

      {stopped && (
        <p className="t-sm faint" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
          이 분은 참여를 중단한 상태예요. 지금까지 나눈 대화는 볼 수 있지만 새 메시지는 못 보내요.
        </p>
      )}

      <p className="t-sm faint" style={{ margin: '0 0 7px' }}>자기소개</p>
      <p className="t-body wrap">{participant.self_description}</p>

      <p className="t-sm faint" style={{ margin: '18px 0 7px' }}>찾는 사람</p>
      <p className="t-body wrap">{participant.connection_intent}</p>

      {recommendation?.reason && (
        <div className="why" style={{ marginTop: 18 }}>
          <div className="t-sm faint" style={{ marginBottom: 9 }}>왜 추천했나</div>
          <p className="t-md" style={{ lineHeight: 1.55 }}>{recommendation.reason}</p>
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingBottom: 20 }}>
        <button type="button" className="btn" disabled={stopped} onClick={() => openChat(participant)}>
          {stopped ? '지금은 메시지를 보낼 수 없어요' : '채팅 시작'}
        </button>
      </div>
    </section>
  );
}
