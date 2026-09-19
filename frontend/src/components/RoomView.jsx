import React, { useState } from 'react';
import { 
  Users, 
  MapPin, 
  Edit3, 
  Check, 
  BarChart3, 
  LogOut,
  UserPlus
} from 'lucide-react';

const STATUS_MAP = {
  OPEN: { label: '대화 가능', emoji: '🟢', class: 'OPEN' },
  FOCUS: { label: '집중 중', emoji: '🔴', class: 'FOCUS' },
  BREAK: { label: '같이 쉬기', emoji: '☕', class: 'BREAK' },
  NEED_HELP: { label: '도움 필요', emoji: '🙋', class: 'NEED_HELP' },
  CAN_HELP: { label: '도움 가능', emoji: '💪', class: 'CAN_HELP' },
};

export default function RoomView({
  roomData,
  currentUser,
  onUpdateStatus,
  onSimulatePeer,
  onOpenAdmin,
  onLeave,
}) {
  const [editing, setEditing] = useState(false);
  const [newStatus, setNewStatus] = useState(currentUser.status);
  const [newNote, setNewNote] = useState(currentUser.note || '');

  const handleSaveStatus = (e) => {
    e.preventDefault();
    onUpdateStatus({
      status: newStatus,
      note: newNote,
    });
    setEditing(false);
  };

  const counts = roomData?.counts || { OPEN: 0, FOCUS: 0, BREAK: 0, NEED_HELP: 0, CAN_HELP: 0 };
  const members = roomData?.members || [];

  return (
    <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Room Header Banner */}
      <div style={{ 
        background: 'var(--bg-card)', 
        padding: '14px 16px', 
        borderRadius: 'var(--radius-sm)', 
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--status-open)', fontWeight: 500 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--status-open)' }} />
              실시간 상태 동기화 중
            </div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
              {roomData?.title || '코쓱톤 네트워킹'}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button 
              onClick={onOpenAdmin}
              className="btn-icon" 
              title="운영진 대시보드"
            >
              <BarChart3 size={15} />
            </button>
            <button 
              onClick={onLeave}
              className="btn-icon" 
              title="퇴장"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>

        {/* Aggregated Status Counter Strip */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          background: 'var(--bg-input)', 
          padding: '7px 10px', 
          borderRadius: 'var(--radius-xs)',
          fontSize: '0.74rem',
          border: '1px solid var(--border-subtle)'
        }}>
          <span style={{ color: 'var(--status-open)' }}>🟢 {counts.OPEN || 0}</span>
          <span style={{ color: '#818cf8' }}>🙋 {counts.NEED_HELP || 0}</span>
          <span style={{ color: '#38bdf8' }}>💪 {counts.CAN_HELP || 0}</span>
          <span style={{ color: 'var(--status-break)' }}>☕ {counts.BREAK || 0}</span>
          <span style={{ color: 'var(--status-focus)' }}>🔴 {counts.FOCUS || 0}</span>
          <span style={{ color: 'var(--text-muted)' }}>| 총 {members.length}명</span>
        </div>
      </div>

      {/* My Current Status Card */}
      <div style={{ 
        background: 'var(--bg-card)', 
        border: '1px solid var(--border-subtle)', 
        borderRadius: 'var(--radius-sm)', 
        padding: '14px 16px' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
            내 현재 상태 (Presence)
          </div>
          <button 
            onClick={() => setEditing(!editing)}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: 'var(--text-secondary)', 
              fontSize: '0.76rem', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px', 
              cursor: 'pointer',
              fontWeight: 500 
            }}
          >
            <Edit3 size={12} />
            {editing ? '닫기' : '상태 변경'}
          </button>
        </div>

        {!editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`status-pill ${currentUser.status}`}>
                {STATUS_MAP[currentUser.status]?.label || currentUser.status}
              </span>
              <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{currentUser.nick}</span>
              {currentUser.school && (
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>({currentUser.school})</span>
              )}
            </div>
            {currentUser.note && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', background: 'var(--bg-input)', padding: '6px 10px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
                "{currentUser.note}"
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSaveStatus} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {Object.keys(STATUS_MAP).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setNewStatus(st)}
                  className={`status-pill ${st}`}
                  style={{
                    cursor: 'pointer',
                    opacity: newStatus === st ? 1 : 0.45,
                    border: newStatus === st ? '1px solid var(--border-active)' : '1px solid transparent'
                  }}
                >
                  {STATUS_MAP[st].emoji} {STATUS_MAP[st].label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="상태 한 줄 입력 (최대 140자)"
              className="input-field"
              maxLength={140}
              style={{ fontSize: '0.82rem', padding: '7px 10px' }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn-primary" style={{ padding: '7px 12px', fontSize: '0.8rem', width: 'auto' }}>
                <Check size={14} /> 저장
              </button>
              <button type="button" onClick={() => setEditing(false)} className="btn-secondary" style={{ padding: '7px 12px', fontSize: '0.8rem' }}>
                취소
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Demo Simulation Action Strip */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '9px 12px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border-subtle)'
      }}>
        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
          상대방 참가 시뮬레이션
        </span>
        <button
          onClick={onSimulatePeer}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-medium)',
            color: 'var(--text-primary)',
            fontSize: '0.74rem',
            fontWeight: 500,
            padding: '4px 9px',
            borderRadius: 'var(--radius-xs)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <UserPlus size={13} />
          {currentUser.status === 'NEED_HELP' ? '민서 (도커 CI) 입장' : '지원 (배포 막힘) 입장'}
        </button>
      </div>

      {/* Room Member List */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Users size={14} />
            행사장 참가자 ({members.length})
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            거리: 닿는 거리
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {members.length === 0 ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
              아직 참가자가 없습니다.
            </div>
          ) : (
            members.map((m) => {
              const isMe = m.id === currentUser.id;
              const statusCfg = STATUS_MAP[m.status] || { label: m.status, emoji: '🟢', class: 'OPEN' };
              
              return (
                <div 
                  key={m.id} 
                  className="glass-card" 
                  style={{ 
                    borderLeft: isMe ? '2px solid var(--text-primary)' : '1px solid var(--border-subtle)',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '7px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ 
                        width: '28px', 
                        height: '28px', 
                        borderRadius: 'var(--radius-xs)', 
                        background: isMe ? 'var(--bg-subtle)' : 'var(--bg-input)', 
                        border: '1px solid var(--border-subtle)',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: '0.78rem',
                        color: 'var(--text-primary)'
                      }}>
                        {m.nick ? m.nick[0] : '?'}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.86rem' }}>{m.nick}</span>
                          {isMe && (
                            <span style={{ fontSize: '0.66rem', padding: '1px 5px', borderRadius: 'var(--radius-xs)', background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>
                              나
                            </span>
                          )}
                          {m.school && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.school}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <span className={`status-pill ${statusCfg.class}`}>
                      <span className="status-indicator-dot" />
                      {statusCfg.emoji} {statusCfg.label}
                    </span>
                  </div>

                  {m.note && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.4, paddingLeft: '36px' }}>
                      {m.note}
                    </div>
                  )}

                  {m.tags && m.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', paddingLeft: '36px' }}>
                      {m.tags.map((tag, tIdx) => (
                        <span key={tIdx} className="tag-chip">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--text-muted)', paddingLeft: '36px' }}>
                    <MapPin size={11} />
                    {m.zone || '중앙 홀'} · 닿는 거리
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
