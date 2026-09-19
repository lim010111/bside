// 입장 / 내 정보 수정 화면. 닉네임 + 자기소개 + 교류 의도, 자유 입력 두 개.
// docs/api-contract.md: nickname 1~20자, self_description·connection_intent 1~500자.
// 수정 모드에서는 닉네임을 못 바꾼다 — "닉네임 수정은 이번 API에서 다루지 않고
// 두 자유 입력만 수정한다"(development-contract.md). 참여 중단(stop)도 여기서.
import { useEffect, useRef, useState } from 'react';
import { useRoom } from '../state.jsx';

export default function Entry() {
  const { state, join, updateMe, cancelEdit, stopParticipating } = useRoom();
  const { room, me, editing } = state;

  const nickRef = useRef(null);
  const [nickname, setNickname] = useState(me?.nickname ?? '');
  const [selfDesc, setSelfDesc] = useState(me?.self_description ?? '');
  const [intent, setIntent] = useState(me?.connection_intent ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    nickRef.current?.focus();
  }, []);

  if (!room) return null;

  async function submit() {
    const n = nickname.trim();
    const s = selfDesc.trim();
    const i = intent.trim();
    if (!editing && !n) { setError('닉네임을 입력해 주세요'); nickRef.current?.focus(); return; }
    if (!s) { setError('자기소개를 한 줄이라도 적어 주세요'); return; }
    if (!i) { setError('어떤 사람을 만나고 싶은지 적어 주세요'); return; }
    setError('');
    if (editing) await updateMe({ self_description: s, connection_intent: i });
    else await join({ nickname: n, self_description: s, connection_intent: i });
  }

  return (
    <section className="screen on">
      <header style={{ padding: '16px 0 12px' }}>
        <div className="row" style={{ justifyContent: 'space-between', minHeight: 22 }}>
          {editing ? (
            <button type="button" className="row" style={{ gap: 4, fontSize: 12, color: 'var(--text-dim)' }} onClick={cancelEdit}>
              <svg className="ic" style={{ width: 14, height: 14 }}><use href="#i-back" /></svg>
              목록으로
            </button>
          ) : (
            <span className="t-sm faint" style={{ fontWeight: 500, letterSpacing: '-.02em' }}>Bside</span>
          )}
        </div>
        <h1 className="t-xl" style={{ margin: '10px 0 0' }}>{room.title}</h1>
        <p className="t-sm dim" style={{ margin: '5px 0 0' }}>
          {editing ? '자기소개와 찾는 사람을 고치면 추천도 다시 계산됩니다.' : '닉네임과 두 줄을 적으면 같은 방 사람들이 볼 수 있어요.'}
        </p>
      </header>

      <div style={{ borderTop: '1px solid var(--border)', margin: '10px 0 16px' }} />

      {!editing && (
        <div style={{ marginBottom: 14 }}>
          <label className="t-sm dim" htmlFor="nickname">닉네임</label>
          <input
            id="nickname" ref={nickRef} className="field" style={{ marginTop: 5 }}
            maxLength={20} placeholder="지원" autoComplete="off"
            value={nickname} onChange={(e) => setNickname(e.target.value)}
          />
        </div>
      )}

      <label className="t-sm dim" htmlFor="self">자기소개 — 어떤 사람인가요</label>
      <textarea
        id="self" className="field" style={{ marginTop: 5, height: 84 }} maxLength={500}
        placeholder="퇴근 후 작은 앱을 만드는 프론트엔드 개발자입니다."
        value={selfDesc} onChange={(e) => setSelfDesc(e.target.value)}
      />
      <p className="t-sm faint" style={{ textAlign: 'right', margin: '4px 0 0' }}>{selfDesc.length} / 500</p>

      <div style={{ marginTop: 14 }}>
        <label className="t-sm dim" htmlFor="intent">어떤 사람을 만나고 싶나요</label>
        <textarea
          id="intent" className="field" style={{ marginTop: 5, height: 84 }} maxLength={500}
          placeholder="사이드 프로젝트를 만드는 사람과 시행착오를 나누고 싶어요."
          value={intent} onChange={(e) => setIntent(e.target.value)}
        />
        <p className="t-sm faint" style={{ textAlign: 'right', margin: '4px 0 0' }}>{intent.length} / 500</p>
      </div>

      <p className="err" style={{ marginTop: 8 }}>{error}</p>

      <div style={{ marginTop: 'auto', paddingBottom: 20 }}>
        <button type="button" className="btn" onClick={submit}>{editing ? '저장' : '들어가기'}</button>
        {editing && me?.participation_status === 'active' && (
          <button type="button" className="btn btn-ghost" style={{ marginTop: 9 }} onClick={stopParticipating}>
            참여 중단하기
          </button>
        )}
      </div>
    </section>
  );
}
