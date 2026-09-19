import React from 'react';
import { X, Check, AlertCircle, Split } from 'lucide-react';

export default function ContrastModal({ onClose }) {
  return (
    <div className="match-overlay" onClick={onClose}>
      <div className="match-card" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <div style={{ 
            width: '28px', 
            height: '28px', 
            borderRadius: 'var(--radius-xs)', 
            background: 'var(--bg-subtle)', 
            border: '1px solid var(--border-subtle)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: 'var(--text-primary)'
          }}>
            <Split size={15} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)' }}>
              접점 설계의 차이
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              유사도 매칭 vs 상보성 매칭
            </h3>
          </div>
        </div>

        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.45 }}>
          "배포에서 막힘"과 "작년에 도커 해봄"은 <strong>겹치는 단어가 0개</strong>입니다. 일반적인 단어 유사도로는 매칭될 수 없습니다.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          {/* Similarity Matching Box */}
          <div style={{ 
            background: 'var(--bg-card)', 
            border: '1px solid var(--border-subtle)', 
            borderRadius: 'var(--radius-sm)', 
            padding: '12px 14px' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#f87171' }}>
                기존 단어 유사도 매칭
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>지원 ↔ 태현</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '6px', lineHeight: 1.4 }}>
              • 지원: "배포에서 막힘" ↔ 태현: "배포가 처음이라 막막함"
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: '#fca5a5' }}>
              <AlertCircle size={13} /> 겹치는 단어 2개 → 둘 다 모른다 (해결 불가) ❌
            </div>
          </div>

          {/* Bside Complementary Matching Box */}
          <div style={{ 
            background: 'var(--bg-card)', 
            border: '1px solid var(--border-medium)', 
            borderRadius: 'var(--radius-sm)', 
            padding: '12px 14px' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#34d399' }}>
                Bside 상보성 매칭
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>지원 ↔ 민서</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '6px', lineHeight: 1.4 }}>
              • 지원: "배포 권한 오류로 막힘" ↔ 민서: "작년에 도커 CI 구축해봄"
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: '#6ee7b7' }}>
              <Check size={13} /> 겹치는 단어 0개 → 찾는 사람과 해본 사람 (상보 관계) ✅
            </div>
          </div>
        </div>

        <div style={{ 
          background: 'var(--bg-subtle)', 
          border: '1px solid var(--border-subtle)',
          padding: '11px', 
          borderRadius: 'var(--radius-sm)', 
          textAlign: 'center',
          fontSize: '0.82rem',
          fontWeight: 500,
          color: 'var(--text-primary)',
          marginBottom: '16px'
        }}>
          "우리가 찾는 건 닮은 사람이 아니라 서로를 채우는 사람입니다."
        </div>

        <button onClick={onClose} className="btn-primary">
          확인
        </button>
      </div>
    </div>
  );
}
