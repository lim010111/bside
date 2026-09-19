import React from 'react';
import { X, MessageSquare, MapPin, ArrowRight } from 'lucide-react';

export default function MatchModal({ match, currentUser, onReact, onClose }) {
  if (!match) return null;

  const isSeeker = currentUser.id === match.seeker_id;
  const partnerNick = isSeeker ? match.helper_nick : match.seeker_nick;

  const handleLike = () => {
    onReact(match.id, 'LIKE');
    onClose();
  };

  const handleDismiss = () => {
    onReact(match.id, 'DISMISS');
    onClose();
  };

  const strengthPercent = Math.round((match.strength || 0.88) * 100);

  return (
    <div className="match-overlay" onClick={onClose}>
      <div className="match-card" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer'
          }}
        >
          <X size={18} />
        </button>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ 
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 7px',
            borderRadius: 'var(--radius-xs)',
            background: 'var(--bg-subtle)',
            color: 'var(--text-secondary)',
            fontSize: '0.72rem',
            fontWeight: 500,
            marginBottom: '8px',
            border: '1px solid var(--border-subtle)'
          }}>
            대화 상대 추천
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            닿는 거리에 {partnerNick}님이 있습니다
          </h3>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
            <MapPin size={12} /> {match.helper_zone || '중앙 홀'} · 같은 행사장
          </div>
        </div>

        {/* Why Box */}
        <div style={{ 
          background: 'var(--bg-card)', 
          border: '1px solid var(--border-subtle)', 
          borderRadius: 'var(--radius-sm)', 
          padding: '12px 14px',
          marginBottom: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              연결 이유 (상보성)
            </span>
            <span style={{ 
              fontSize: '0.7rem', 
              fontWeight: 500, 
              color: '#38bdf8',
              background: 'rgba(14, 165, 233, 0.1)',
              padding: '1px 6px',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid rgba(14, 165, 233, 0.2)'
            }}>
              상보성 {strengthPercent}%
            </span>
          </div>

          <div style={{ fontSize: '0.86rem', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.45 }}>
            {match.why || `${partnerNick}님은 관련 경험이 있어 도움을 주고받을 수 있습니다.`}
          </div>
        </div>

        {/* Opener Suggestion Box */}
        <div style={{ 
          background: 'var(--bg-subtle)', 
          border: '1px solid var(--border-subtle)', 
          borderRadius: 'var(--radius-sm)', 
          padding: '12px 14px',
          marginBottom: '18px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            <MessageSquare size={13} />
            추천 첫마디
          </div>
          <div style={{ 
            fontSize: '0.9rem', 
            fontWeight: 500, 
            color: 'var(--text-primary)', 
            lineHeight: 1.4,
            paddingLeft: '8px',
            borderLeft: '2px solid var(--text-muted)'
          }}>
            "{match.opener || `${partnerNick}님, 안녕하세요! 혹시 관련해서 잠깐 이야기 나눠볼 수 있을까요?`}"
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '8px' }}>
          <button 
            type="button"
            onClick={handleLike} 
            className="btn-primary"
          >
            말 걸러 가기
            <ArrowRight size={15} />
          </button>
          <button 
            type="button"
            onClick={handleDismiss} 
            className="btn-secondary"
          >
            괜찮아요
          </button>
        </div>

        <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '12px' }}>
          앱에서 텍스트 채팅을 하지 않고, 현실에서 말을 겁니다.
        </div>
      </div>
    </div>
  );
}
