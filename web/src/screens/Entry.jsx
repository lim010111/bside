// 입장 화면. prototype의 S2(193~237줄) + renderPreview/renderAff/affPick/affValue/
// pick/noteTyped/saveStatus/restoreAff(562~725줄)를 컴포넌트로 옮긴 것.
//
// 미리보기 화면은 없다. 닉네임·소속·상태·한 줄이 이 한 화면에 있고, 올려야 방이 열린다.
// 매칭은 내 한 줄이 있어야 성립하므로 구경만 하는 사람을 만들지 않는다.
import { useEffect, useRef, useState } from 'react';
import { useRoom } from '../state.jsx';
import { STATUSES } from '../api/index.js';
import StatusPicker from '../components/StatusPicker.jsx';
import { Stats } from '../components/Composition.jsx';

const OTHER = '__other';

export default function Entry() {
  const { state, join, updateStatus, cancelEdit } = useRoom();
  const { room, members, me, editing } = state;

  const nickRef = useRef(null);
  const [nick, setNick] = useState(me?.name ?? '');
  const [status, setStatus] = useState(me?.st ?? null);
  const [note, setNote] = useState(me?.note ?? '');
  const [error, setError] = useState('');

  // 소속: <select>가 있는 방(학교 목록)과 자유 입력만 있는 방(회사 등)을 나눈다.
  // room.aff.options가 배열이면 select, null이면 곧바로 자유 입력.
  const hasOptions = !!room?.aff?.options;
  const initialSelect = hasOptions
    ? (me && room.aff.options.includes(me.school) ? me.school : (me ? OTHER : room.aff.options[0]))
    : '';
  const [affSelect, setAffSelect] = useState(initialSelect);
  const [affOther, setAffOther] = useState(hasOptions && me && !room.aff.options.includes(me.school) ? me.school : '');
  const [affFree, setAffFree] = useState(!hasOptions ? (me?.school ?? '') : '');

  const affValue = hasOptions ? (affSelect === OTHER ? affOther.trim() : affSelect) : affFree.trim();

  useEffect(() => {
    nickRef.current?.focus();
  }, []);

  if (!room) return null; // getRoom() 응답 대기. 3~4단계에서 로딩 스켈레톤을 쓴다면 여기

  function pick(k) {
    setStatus(k);
    if (error) setError('');
  }

  function noteChanged(v) {
    setNote(v);
    if (v.trim() && error) setError('');
  }

  async function submit() {
    const n = nick.trim();
    if (!n) { setError('닉네임을 입력해 주세요'); nickRef.current?.focus(); return; }
    if (!affValue) { setError(`${room.aff.label}을 입력해 주세요`); return; }
    if (!status) { setError('상태를 하나 골라주세요'); return; }
    const v = note.trim();
    if (!v) { setError('한 줄만 적어주세요. 이게 있어야 이어드릴 수 있어요'); return; }
    setError('');
    const payload = { nick: n, school: affValue, status, note: v };
    if (editing) await updateStatus(payload);
    else await join(payload);
  }

  const statusLabel = status ? STATUSES.find((s) => s.k === status) : null;

  return (
    <section className="screen on">
      <header style={{ padding: '16px 0 12px' }}>
        <div className="row" style={{ justifyContent: 'space-between', minHeight: 22 }}>
          {me ? (
            <button
              type="button"
              className="row"
              style={{ gap: 4, fontSize: 12, color: 'var(--text-dim)' }}
              onClick={cancelEdit}
            >
              <svg className="ic" style={{ width: 14, height: 14 }}><use href="#i-back" /></svg>
              방으로
            </button>
          ) : (
            <span className="t-sm faint" style={{ fontWeight: 500, letterSpacing: '-.02em' }}>Bside</span>
          )}
          <span className="t-sm faint">{room.when.split(' · ').pop()}</span>
        </div>
        <h1 className="t-xl" style={{ margin: '10px 0 0' }}>{room.title}</h1>
        <p className="t-sm dim" style={{ margin: '5px 0 0' }}>
          {members.length ? `지금 ${members.length}명이 상태를 올려뒀어요` : '아직 아무도 없어요'}
        </p>
      </header>

      <Stats list={members} />

      {/* 누가 있는지는 알려주되 무슨 말을 했는지는 올린 뒤에 보여준다 */}
      <p className="t-sm faint" style={{ margin: '10px 0 0', lineHeight: 1.55 }}>
        {members.length
          ? `한 줄을 올리면 ${members.length}명이 뭘 찾고 있는지 보입니다.`
          : '아직 아무도 없어요. 첫 번째로 올려보세요.'}
      </p>

      <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0 2px' }} />

      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div className="grow">
          <label className="t-sm dim" htmlFor="nick">닉네임</label>
          <input
            id="nick" ref={nickRef} className="field" style={{ marginTop: 5 }}
            maxLength={12} placeholder="지원" autoComplete="off"
            value={nick} onChange={(e) => setNick(e.target.value)}
          />
        </div>
        <div className="grow">
          <label className="t-sm dim" htmlFor="aff">{room.aff.label}</label>
          <div style={{ marginTop: 5 }}>
            {hasOptions ? (
              <select id="aff" className="field" value={affSelect} onChange={(e) => setAffSelect(e.target.value)}>
                {room.aff.options.map((o) => <option key={o} value={o}>{o}</option>)}
                <option value={OTHER}>직접 입력</option>
              </select>
            ) : (
              <input
                id="aff" className="field" maxLength={20} autoComplete="off"
                placeholder={room.aff.placeholder} value={affFree}
                onChange={(e) => setAffFree(e.target.value)}
              />
            )}
          </div>
        </div>
      </div>
      {hasOptions && affSelect === OTHER && (
        <div style={{ marginTop: 8 }}>
          <input
            className="field" maxLength={20} autoComplete="off" autoFocus
            placeholder={room.aff.placeholder} value={affOther}
            onChange={(e) => setAffOther(e.target.value)}
          />
        </div>
      )}

      <p className="t-sm dim" style={{ margin: '18px 0 7px' }}>지금 무엇을 찾고 계세요?</p>
      <StatusPicker value={status} onChange={pick} />

      <div style={{ marginTop: 14 }}>
        <textarea
          className="field" maxLength={140}
          placeholder={statusLabel?.ph ?? '배포·CI 경험 있으신 분 찾아요'}
          value={note} onChange={(e) => noteChanged(e.target.value)}
        />
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
          <span className="err" style={{ margin: 0 }}>{error}</span>
          <span className="t-sm faint">{note.length} / 140</span>
        </div>
      </div>

      <div style={{ marginTop: 'auto', paddingBottom: 20 }}>
        <button type="button" className="btn" onClick={submit}>올리기</button>
      </div>
    </section>
  );
}
