import React from 'react';
import { X, Smartphone, Copy, Check } from 'lucide-react';

export default function QRCodeModal({ roomCode, onClose }) {
  const [copied, setCopied] = React.useState(false);
  const joinUrl = window.location.origin;

  const handleCopy = () => {
    navigator.clipboard.writeText(`${joinUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="match-overlay" onClick={onClose}>
      <div className="match-card" style={{ maxWidth: '360px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
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

        <div style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '6px', 
          padding: '2px 8px', 
          borderRadius: 'var(--radius-xs)', 
          background: 'var(--bg-subtle)', 
          color: 'var(--text-secondary)', 
          fontSize: '0.72rem', 
          fontWeight: 500, 
          marginBottom: '10px',
          border: '1px solid var(--border-subtle)'
        }}>
          <Smartphone size={12} />
          주최자 배포용 QR
        </div>

        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
          스마트폰으로 스캔하세요
        </h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          별도 설치 없이 카메라로 비추면 바로 방에 입장합니다.
        </p>

        {/* QR Code Frame */}
        <div style={{ 
          background: '#ffffff', 
          padding: '16px', 
          borderRadius: 'var(--radius-sm)', 
          display: 'inline-flex', 
          flexDirection: 'column',
          alignItems: 'center',
          boxShadow: 'var(--shadow-card)',
          marginBottom: '16px'
        }}>
          <svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="180" height="180" fill="white"/>
            {/* Top-left block */}
            <rect x="15" y="15" width="45" height="45" fill="#111317"/>
            <rect x="22" y="22" width="31" height="31" fill="white"/>
            <rect x="29" y="29" width="17" height="17" fill="#111317"/>
            {/* Top-right block */}
            <rect x="120" y="15" width="45" height="45" fill="#111317"/>
            <rect x="127" y="22" width="31" height="31" fill="white"/>
            <rect x="134" y="29" width="17" height="17" fill="#111317"/>
            {/* Bottom-left block */}
            <rect x="15" y="120" width="45" height="45" fill="#111317"/>
            <rect x="22" y="127" width="31" height="31" fill="white"/>
            <rect x="29" y="134" width="17" height="17" fill="#111317"/>
            {/* Data matrix pattern */}
            <rect x="70" y="20" width="10" height="10" fill="#111317"/>
            <rect x="90" y="20" width="10" height="10" fill="#111317"/>
            <rect x="80" y="40" width="10" height="10" fill="#111317"/>
            <rect x="100" y="40" width="10" height="10" fill="#111317"/>
            <rect x="20" y="70" width="10" height="10" fill="#111317"/>
            <rect x="40" y="80" width="10" height="10" fill="#111317"/>
            <rect x="70" y="70" width="40" height="40" fill="#111317"/>
            <rect x="78" y="78" width="24" height="24" fill="#ffffff"/>
            <rect x="84" y="84" width="12" height="12" fill="#111317"/>
            <rect x="120" y="70" width="10" height="10" fill="#111317"/>
            <rect x="140" y="80" width="10" height="10" fill="#111317"/>
            <rect x="70" y="120" width="10" height="10" fill="#111317"/>
            <rect x="90" y="130" width="10" height="10" fill="#111317"/>
            <rect x="120" y="120" width="10" height="10" fill="#111317"/>
            <rect x="140" y="140" width="10" height="10" fill="#111317"/>
            <rect x="80" y="150" width="20" height="10" fill="#111317"/>
            <rect x="130" y="150" width="15" height="10" fill="#111317"/>
          </svg>

          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111317', marginTop: '6px', letterSpacing: '0.04em' }}>
            ROOM: {roomCode}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button onClick={handleCopy} className="btn-secondary" style={{ fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? '복사됨' : '웹 주소 복사'}
          </button>
          <button onClick={onClose} className="btn-primary" style={{ width: 'auto', padding: '7px 16px', fontSize: '0.78rem' }}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
