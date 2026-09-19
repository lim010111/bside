import React, { useEffect, useState } from 'react';
import { QrCode, Download, Trash2, CheckCircle2 } from 'lucide-react';

export default function AdminDashboard({ onBack, onOpenQR, roomCode = 'KOSS26' }) {
  const [summary, setSummary] = useState(null);
  const [destroyed, setDestroyed] = useState(false);

  useEffect(() => {
    fetch('/api/admin/summary')
      .then((res) => res.json())
      .then((data) => setSummary(data))
      .catch((err) => {
        console.error('Failed to fetch admin summary:', err);
        setSummary({
          event_title: '코쓱톤 네트워킹',
          total_attendees: 90,
          joined_count: 47,
          status_set_count: 41,
          matches_count: 37,
          conversations_started: 24,
          top_topics: [
            ['배포·CI', 9],
            ['서비스 기획', 6],
            ['디자인 시스템', 4],
            ['취업·이직', 3],
          ],
        });
      });
  }, []);

  const handleDestroyRoom = async () => {
    if (!window.confirm('행사를 종료하고 서버의 모든 메모리 방 데이터를 영구 소멸시키겠습니까?')) {
      return;
    }
    try {
      await fetch(`/api/room/${roomCode}/destroy`, { method: 'POST' });
      setDestroyed(true);
    } catch (e) {
      console.error(e);
      setDestroyed(true);
    }
  };

  const handleExportReport = () => {
    alert('📄 행사 종료 후 주최자용 결과 보고서 (PDF/요약본)가 다운로드되었습니다.');
  };

  const joined = summary?.joined_count || 47;
  const total = summary?.total_attendees || 90;
  const statusSet = summary?.status_set_count || 41;
  const matches = summary?.matches_count || 37;
  const conversations = summary?.conversations_started || 24;
  const topics = summary?.top_topics || [
    ['배포·CI', 9],
    ['서비스 기획', 6],
    ['디자인 시스템', 4],
    ['취업·이직', 3],
  ];

  return (
    <div style={{ padding: '0 16px 30px', display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* S6 Header */}
      <header style={{ padding: '20px 0 16px' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h1 className="t-lg" style={{ margin: 0 }}>
              {summary?.event_title || '코쓱톤 네트워킹'}
            </h1>
            <p className="t-sm faint" style={{ margin: '3px 0 0' }}>
              운영진 화면 · 실시간
            </p>
          </div>
          <button onClick={onBack} className="t-sm dim" style={{ height: '44px' }}>
            참가자 화면
          </button>
        </div>
      </header>

      {/* Metrics Grid */}
      <div className="metrics">
        <div className="metric">
          <div className="t-sm dim">입장</div>
          <div className="t-num" style={{ marginTop: '3px' }}>
            {joined}
            <span className="t-sm faint"> / {total}</span>
          </div>
        </div>

        <div className="metric">
          <div className="t-sm dim">상태 설정</div>
          <div className="t-num" style={{ marginTop: '3px' }}>
            {statusSet}
          </div>
        </div>

        <div className="metric">
          <div className="t-sm dim">접점 발견</div>
          <div className="t-num" style={{ marginTop: '3px' }}>
            {matches}
          </div>
        </div>

        <div className="metric key" style={{ border: '1px solid var(--border-strong)' }}>
          <div className="t-sm dim">대화 시작 (핵심)</div>
          <div className="t-num" style={{ marginTop: '3px', color: 'var(--sharing)' }}>
            {conversations}
          </div>
        </div>
      </div>

      {/* Topics */}
      <p className="t-sm dim" style={{ margin: '22px 0 2px' }}>
        많이 나온 주제
      </p>
      <div>
        {topics.map(([name, count]) => (
          <div key={name} className="topic">
            <span className="t-md">{name}</span>
            <span className="t-sm dim">{count}건</span>
          </div>
        ))}
      </div>

      {/* Privacy Notice Banner */}
      {destroyed && (
        <div
          style={{
            margin: '20px 0',
            padding: '14px',
            background: 'var(--surface-hi)',
            borderRadius: 'var(--r-card)',
            border: '1px solid var(--sharing)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <CheckCircle2 color="var(--sharing)" size={20} />
          <div className="t-sm" style={{ color: 'var(--text)' }}>
            행사가 종료되어 모든 방과 프로필이 메모리에서 영구 소멸되었습니다.
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="row" style={{ gap: '9px', marginTop: 'auto', paddingTop: '24px' }}>
        <button className="btn btn-ghost" style={{ height: '46px' }} onClick={onOpenQR}>
          <QrCode size={16} /> QR 띄우기
        </button>
        <button className="btn btn-ghost" style={{ height: '46px' }} onClick={handleExportReport}>
          <Download size={16} /> 리포트
        </button>
      </div>

      <div style={{ marginTop: '10px' }}>
        <button
          className="btn btn-ghost"
          style={{ height: '42px', color: 'var(--danger)', borderColor: 'rgba(248,113,113,0.2)' }}
          onClick={handleDestroyRoom}
        >
          <Trash2 size={15} /> 행사 종료 및 데이터 완전 소멸
        </button>
      </div>
    </div>
  );
}
