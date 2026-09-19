import React from 'react';
import { X, ShieldCheck, Check, Lock } from 'lucide-react';

export default function PrivacyModal({ onClose }) {
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <div style={{ 
            width: '28px', 
            height: '28px', 
            borderRadius: 'var(--radius-xs)', 
            background: 'var(--bg-subtle)', 
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center'
          }}>
            <ShieldCheck size={16} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)' }}>
              데이터 보호 및 프라이버시
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              정보 공개 범위 대조 (F6)
            </h3>
          </div>
        </div>

        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.4 }}>
          사용자의 불필요한 개인정보를 수집하지 않으며, 서버 영구 DB 없이 메모리로만 동작해 행사 종료 시 소멸됩니다.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          {/* Shared Column */}
          <div style={{ 
            background: 'var(--bg-card)', 
            border: '1px solid var(--border-subtle)', 
            borderRadius: 'var(--radius-sm)', 
            padding: '12px' 
          }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Check size={13} /> 상대에게 보이는 것
            </div>
            <ul style={{ listStyle: 'none', fontSize: '0.74rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>• 닉네임</li>
              <li>• 소속 (선택)</li>
              <li>• 현재 상태(Presence)</li>
              <li>• 상태 한 줄 및 추출 태그</li>
              <li>• 위치 구역 (닿는 거리)</li>
            </ul>
          </div>

          {/* Protected Column */}
          <div style={{ 
            background: 'var(--bg-card)', 
            border: '1px solid var(--border-subtle)', 
            borderRadius: 'var(--radius-sm)', 
            padding: '12px' 
          }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Lock size={12} /> 어디에도 남지 않는 것
            </div>
            <ul style={{ listStyle: 'none', fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>• 실명 / 주민등록번호</li>
              <li>• 전화번호 / 개인 연락처</li>
              <li>• 영구 데이터베이스 저장</li>
              <li>• 행사 종료 시 즉시 소멸</li>
              <li>• 5분 미활동 시 자동 삭제</li>
            </ul>
          </div>
        </div>

        <button onClick={onClose} className="btn-primary">
          닫기
        </button>
      </div>
    </div>
  );
}
