// 운영진 대시보드. prototype의 S6(294~325줄)를 옮긴 것.
// 참가자 화면과 별도 진입이다(PRD 6장) — join 없이 ?view=dashboard로 바로 본다.
// 모바일 그대로 쓴다: 지금까지 전부 모바일 전용이고, 운영진도 행사 중엔 자리에
// 앉아 PC를 보기보다 폰으로 확인할 가능성이 높다. PC가 필요한 건 종료 후 PDF
// 리포트(roadmap.md v0.2)인데 그건 실시간 화면이 아니라 별도 내보내기 기능이다.
import { useEffect, useState } from 'react';
import { useRoom } from '../state.jsx';
import { api } from '../api/index.js';

export default function Dashboard() {
  const { state } = useRoom();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.getDashboard(state.code).then(setStats);
  }, [state.code]);

  function backToParticipant() {
    const url = new URL(window.location.href);
    url.searchParams.delete('view');
    window.location.href = url.toString();
  }

  if (!stats) return null;

  return (
    <section className="screen on">
      <header style={{ padding: '20px 0 16px' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h1 className="t-lg" style={{ margin: 0 }}>{state.room?.title}</h1>
            <p className="t-sm faint" style={{ margin: '3px 0 0' }}>운영진 화면 · 실시간</p>
          </div>
          <button type="button" className="t-sm dim" style={{ height: 44 }} onClick={backToParticipant}>
            참가자 화면
          </button>
        </div>
      </header>

      <div className="metrics">
        <div className="metric">
          <div className="t-sm dim">입장</div>
          <div className="t-num" style={{ marginTop: 3 }}>
            {stats.joined}<span className="t-sm faint"> / {stats.capacity}</span>
          </div>
        </div>
        <div className="metric">
          <div className="t-sm dim">상태 설정</div>
          <div className="t-num" style={{ marginTop: 3 }}>{stats.statusSet}</div>
        </div>
        <div className="metric">
          <div className="t-sm dim">접점 발견</div>
          <div className="t-num" style={{ marginTop: 3 }}>{stats.matched}</div>
        </div>
        <div className="metric key">
          <div className="t-sm dim">대화 시작</div>
          <div className="t-num" style={{ marginTop: 3 }}>{stats.chatted}</div>
        </div>
      </div>

      <p className="t-sm dim" style={{ margin: '22px 0 2px' }}>많이 나온 주제</p>
      <div>
        {stats.topics.map((t) => (
          <div key={t.label} className="topic">
            <span className="t-md">{t.label}</span>
            <span className="t-sm dim">{t.count}건</span>
          </div>
        ))}
      </div>

      <div className="row" style={{ gap: 9, marginTop: 'auto', padding: '20px 0 24px' }}>
        <button type="button" className="btn btn-ghost" style={{ height: 46 }}>
          <svg className="ic"><use href="#i-qr" /></svg> QR 띄우기
        </button>
        <button type="button" className="btn btn-ghost" style={{ height: 46 }}>
          <svg className="ic"><use href="#i-dl" /></svg> 리포트
        </button>
      </div>
    </section>
  );
}
