import React, { useState } from 'react';
import { ArrowRight, ShieldCheck, Check } from 'lucide-react';

const STATUS_OPTIONS = [
  { code: 'OPEN', label: '대화 가능', emoji: '🟢', desc: '자유롭게 이야기 나눌 수 있습니다' },
  { code: 'NEED_HELP', label: '도움 필요', emoji: '🙋', desc: '해결하고 싶은 문제나 오류가 있습니다' },
  { code: 'CAN_HELP', label: '도움 가능', emoji: '💪', desc: '경험이나 노하우를 나눌 수 있습니다' },
  { code: 'FOCUS', label: '집중 중', emoji: '🔴', desc: '작업이나 발표 준비에 몰입 중입니다' },
  { code: 'BREAK', label: '같이 쉬기', emoji: '☕', desc: '가볍게 티타임이나 휴식할 사람을 찾습니다' },
];

const PRESETS = [
  { status: 'NEED_HELP', note: 'GitHub Actions 배포에서 권한 오류로 막힘' },
  { status: 'CAN_HELP', note: '작년에 개인 프로젝트에서 도커 CI 구축해봄' },
  { status: 'NEED_HELP', note: 'FastAPI 비동기 SSE 스트림 세션 관리 막힘' },
  { status: 'OPEN', note: '프론트엔드 React 상태관리 이야기 나눠요' },
];

export default function JoinView({ onJoin, initialRoomCode = 'KOSS26' }) {
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [nick, setNick] = useState('');
  const [school, setSchool] = useState('');
  const [status, setStatus] = useState('NEED_HELP');
  const [note, setNote] = useState('GitHub Actions 배포에서 권한 오류로 막힘');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!nick.trim()) return;
    setLoading(true);
    onJoin({
      roomCode: roomCode.trim().toUpperCase(),
      nick: nick.trim(),
      school: school.trim(),
      status,
      note: note.trim(),
    });
  };

  const applyPreset = (preset) => {
    setStatus(preset.status);
    setNote(preset.note);
    if (!nick) {
      setNick(preset.status === 'NEED_HELP' ? '지원' : '민서');
      setSchool(preset.status === 'NEED_HELP' ? '국민대' : '순천향대');
    }
  };

  return (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <div style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '6px', 
          padding: '3px 8px', 
          borderRadius: 'var(--radius-xs)', 
          background: 'var(--bg-subtle)', 
          color: 'var(--text-secondary)', 
          fontSize: '0.72rem', 
          fontWeight: 500, 
          marginBottom: '10px',
          border: '1px solid var(--border-subtle)'
        }}>
          현장 전용 · 계정 등록 없음
        </div>
        <h1 style={{ fontSize: '1.45rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.3, color: 'var(--text-primary)' }}>
          닿을 수 있는 거리에서<br />
          서로를 채우는 대화
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginTop: '6px', lineHeight: 1.45 }}>
          방 코드로 입장해 현재 상황(상태)을 한 줄로 남겨주세요.<br />
          문제 해결에 알맞은 상보적 대화 상대를 찾아드립니다.
        </p>
      </div>

      {/* Demo Preset Fill */}
      <div style={{ background: 'var(--bg-card)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500 }}>
          빠른 예시 입력
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {PRESETS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => applyPreset(p)}
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                padding: '4px 8px',
                color: 'var(--text-secondary)',
                fontSize: '0.74rem',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              {p.status === 'NEED_HELP' ? '🙋 ' : '💪 '}
              {p.note.length > 18 ? p.note.slice(0, 18) + '...' : p.note}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            행사장 방 코드
          </label>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="예: KOSS26"
            className="input-field"
            required
            maxLength={10}
            style={{ fontWeight: 600, letterSpacing: '0.04em' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              닉네임 <span style={{ color: 'var(--text-muted)' }}>*</span>
            </label>
            <input
              type="text"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder="예: 지원"
              className="input-field"
              required
              maxLength={12}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              소속 (선택)
            </label>
            <input
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              placeholder="예: 국민대"
              className="input-field"
              maxLength={20}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>
            현재 상태 (Presence)
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {STATUS_OPTIONS.map((opt) => {
              const isSelected = status === opt.code;
              return (
                <div
                  key={opt.code}
                  onClick={() => setStatus(opt.code)}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-card)',
                    border: `1px solid ${isSelected ? 'var(--border-active)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'border-color 0.12s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1rem' }}>{opt.emoji}</span>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: isSelected ? '#ffffff' : 'var(--text-primary)' }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {opt.desc}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <Check size={14} color="var(--text-primary)" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
              상태 한 줄 (Note)
            </label>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {note.length}/140
            </span>
          </div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={status === 'NEED_HELP' ? '막힌 문제나 에러 내용을 적어주세요' : '나누고 싶은 경험이나 주제를 적어주세요'}
            className="input-field"
            maxLength={140}
          />
        </div>

        <button type="submit" className="btn-primary" disabled={loading || !nick.trim()} style={{ marginTop: '6px' }}>
          {loading ? '입장 중...' : '입장하기'}
          <ArrowRight size={16} />
        </button>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '2px' }}>
        <ShieldCheck size={13} />
        계정 없이 브라우저 세션으로만 동작하며 행사 종료 시 소멸됩니다.
      </div>
    </div>
  );
}
