// 방 화면. prototype의 S3(240~254줄) + renderRoom()/runMatch()(649~738줄)를 옮긴 것.
//
// 규칙 셋 (spec/design.md, spec/frontend-plan.md 3단계):
//   1. 색은 상태를 뜻할 때만. 카드당 색이 나오는 곳은 상태 라벨 하나
//   2. 근접은 색이 아니라 밝기로 (.person.near)
//   3. 정렬은 시간 순. 관련도 순으로 정렬하면 AI 없이 해결돼서 제품이 필요 없어진다
import { useEffect, useRef, useState } from 'react';
import { useRoom } from '../state.jsx';
import { ageOf, lifeOf } from '../lib/expiry.js';
import { Stats } from '../components/Composition.jsx';
import { PersonGroup } from '../components/PersonCard.jsx';
import MyStatusCard from '../components/MyStatusCard.jsx';
import TouchpointEntry from '../components/TouchpointEntry.jsx';
import TouchpointSheet from '../components/TouchpointSheet.jsx';

export default function Room() {
  const { state, startEdit, loadMatch, openChat } = useRoom();
  const { room, me, members, t0, match, matchLoading, matchChecked } = state;

  const [now, setNow] = useState(Date.now());
  const [sheetOpen, setSheetOpen] = useState(false);
  const wasLoading = useRef(false);

  // 1초마다 시계를 한 번만 흘려보낸다. 카드 46장이 각자 타이머를 안 돌린다
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 접점 조회는 방에 들어온 뒤 한 번만. 편집을 취소하고 돌아와도 다시 묻지 않는다
  useEffect(() => {
    if (!matchChecked) loadMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 로딩이 막 끝난 순간(true -> false)에만 시트를 자동으로 연다.
  // 이후 닫으면 TouchpointEntry로만 다시 연다.
  useEffect(() => {
    if (wasLoading.current && !matchLoading) setSheetOpen(true);
    wasLoading.current = matchLoading;
  }, [matchLoading]);

  if (!room || !me) return null;

  const ppl = members.filter((p) => lifeOf(p, t0, 1, now) > 0).sort((a, b) => ageOf(a, t0, 1, now) - ageOf(b, t0, 1, now));
  const all = [me, ...ppl];
  const fresh = ppl.filter((p) => ageOf(p, t0, 1, now) < 30).length;
  const matchedMember = match ? members.find((p) => p.id === match.personId) : null;

  return (
    <section className="screen on">
      <header style={{ padding: '20px 0 14px' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h1 className="t-lg" style={{ margin: 0 }}>{room.title}</h1>
          <span className="t-sm dim">{ppl.length + 1}명</span>
        </div>
      </header>

      <Stats
        list={all}
        extra={fresh > 0 ? <span className="fresh">방금 {fresh}명 들어옴</span> : null}
      />
      {!all.length && <span className="t-sm dim">아직 아무도 상태를 달지 않았어요</span>}

      <MyStatusCard me={me} t0={t0} now={now} onEdit={startEdit} />

      {matchLoading && (
        <p className="t-sm faint" style={{ margin: '14px 2px 0' }}>
          {ppl.length + 1}명 중에서 찾는 중
        </p>
      )}
      {!matchLoading && matchedMember && (
        <TouchpointEntry member={matchedMember} onOpen={() => setSheetOpen(true)} />
      )}

      <div style={{ marginTop: 20, paddingBottom: 26 }}>
        {ppl.length === 0 ? (
          <div className="empty">
            <svg className="ic"><use href="#i-inbox" /></svg>
            <p className="t-md" style={{ margin: '0 0 6px' }}>아직 이 방에 혼자 계세요</p>
            <p className="t-sm dim" style={{ margin: '0 0 20px', lineHeight: 1.6 }}>누가 들어오면 알려드릴게요.</p>
            <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '0 18px', height: 44, margin: '0 auto' }}>
              <svg className="ic"><use href="#i-qr" /></svg> QR 공유하기
            </button>
          </div>
        ) : (
          <>
            {/* 카드는 정보 표시용. 접점 시트는 TouchpointEntry로만 연다 — 이유는 PersonCard.jsx 주석 */}
            <PersonGroup label="닿는 거리" list={ppl.filter((p) => p.near)} t0={t0} now={now} />
            <PersonGroup label="조금 떨어진 곳" list={ppl.filter((p) => !p.near)} t0={t0} now={now} />
          </>
        )}
      </div>

      <TouchpointSheet
        open={sheetOpen}
        match={match}
        member={matchedMember}
        roomSize={ppl.length + 1}
        myNote={me.note}
        onClose={() => setSheetOpen(false)}
        onChat={(peer) => { setSheetOpen(false); openChat(peer); }}
      />
    </section>
  );
}
