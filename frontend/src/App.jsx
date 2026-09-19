import React, { useState, useEffect, useRef } from 'react';
import JoinView from './components/JoinView';
import RoomView from './components/RoomView';
import MatchModal from './components/MatchModal';
import AdminDashboard from './components/AdminDashboard';
import ContrastModal from './components/ContrastModal';
import PrivacyModal from './components/PrivacyModal';
import QRCodeModal from './components/QRCodeModal';
import { Sparkles, QrCode, BarChart3, Wifi, WifiOff, Split, ShieldCheck } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('bside_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [roomData, setRoomData] = useState(null);
  const [activeMatch, setActiveMatch] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showContrast, setShowContrast] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [connected, setConnected] = useState(false);

  const eventSourceRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);

  useEffect(() => {
    if (!currentUser?.roomCode || !currentUser?.id) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      clearInterval(heartbeatIntervalRef.current);
      return;
    }

    const code = currentUser.roomCode;
    const sseUrl = `/api/room/${code}/stream`;

    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.addEventListener('update', (e) => {
      try {
        const data = JSON.parse(e.data);
        setRoomData(data);
      } catch (err) {
        console.error('Failed to parse update SSE:', err);
      }
    });

    es.addEventListener('match', (e) => {
      try {
        const match = JSON.parse(e.data);
        if (match.seeker_id === currentUser.id || match.helper_id === currentUser.id) {
          setActiveMatch(match);
        }
      } catch (err) {
        console.error('Failed to parse match SSE:', err);
      }
    });

    es.onerror = () => {
      setConnected(false);
    };

    heartbeatIntervalRef.current = setInterval(() => {
      fetch(`/api/room/${code}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentUser.id }),
      }).catch((e) => console.warn('Heartbeat error:', e));
    }, 45000);

    return () => {
      es.close();
      clearInterval(heartbeatIntervalRef.current);
    };
  }, [currentUser?.id, currentUser?.roomCode]);

  const handleJoin = async ({ roomCode, nick, school, status, note, zone }) => {
    try {
      const res = await fetch(`/api/room/${roomCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nick, school, status, note, zone }),
      });
      const data = await res.json();
      const user = {
        id: data.id,
        roomCode,
        nick,
        school,
        status,
        note,
        zone: zone || '중앙 홀',
      };
      setCurrentUser(user);
      sessionStorage.setItem('bside_user', JSON.stringify(user));
    } catch (err) {
      console.error('Join API failed, fallback to local state:', err);
      const user = {
        id: 'local_' + Math.random().toString(36).substring(2, 8),
        roomCode,
        nick,
        school,
        status,
        note,
        zone: zone || '중앙 홀',
      };
      setCurrentUser(user);
      sessionStorage.setItem('bside_user', JSON.stringify(user));
    }
  };

  const handleUpdateStatus = async ({ status, note, zone }) => {
    if (!currentUser) return;
    const updated = { ...currentUser, status, note, zone: zone || currentUser.zone };
    setCurrentUser(updated);
    sessionStorage.setItem('bside_user', JSON.stringify(updated));

    try {
      await fetch(`/api/room/${currentUser.roomCode}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentUser.id, status, note, zone }),
      });
    } catch (err) {
      console.error('Status update failed:', err);
    }
  };

  const handleSimulatePeer = async () => {
    if (!currentUser) return;
    const isSeeker = currentUser.status === 'NEED_HELP';

    const peerData = isSeeker
      ? {
          nick: '민서',
          school: '순천향대',
          status: 'CAN_HELP',
          note: '작년에 개인 프로젝트에서 도커 CI 구축해봄',
          zone: '음료 테이블 앞'
        }
      : {
          nick: '지원',
          school: '국민대',
          status: 'NEED_HELP',
          note: 'GitHub Actions 배포에서 권한 오류로 막힘',
          zone: '중앙 홀'
        };

    try {
      await fetch(`/api/room/${currentUser.roomCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(peerData),
      });
    } catch (err) {
      console.error('Simulate peer failed:', err);
    }
  };

  const handleReactMatch = async (matchId, reaction) => {
    try {
      await fetch(`/api/match/${matchId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: matchId, reaction }),
      });
    } catch (err) {
      console.error('Match react failed:', err);
    }
  };

  const handleLeave = async () => {
    if (currentUser) {
      try {
        await fetch(`/api/room/${currentUser.roomCode}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: currentUser.id }),
        });
      } catch (err) {
        console.error('Leave error:', err);
      }
    }
    sessionStorage.removeItem('bside_user');
    setCurrentUser(null);
    setRoomData(null);
    setActiveMatch(null);
    setShowAdmin(false);
  };

  const currentRoomCode = currentUser?.roomCode || 'KOSS26';

  return (
    <div className="app-container">
      {/* Top Application Header */}
      <header className="top-bar">
        <div className="brand-badge" onClick={() => setShowAdmin(false)}>
          <span className="brand-logo">Bside</span>
          <span className="brand-tagline">
            {currentRoomCode}
          </span>
        </div>

        <div className="top-actions">
          <button 
            onClick={() => setShowQR(true)} 
            className="btn-icon" 
            title="방 QR 코드 보기"
          >
            <QrCode size={16} />
          </button>
          
          <button 
            onClick={() => setShowContrast(true)} 
            className="btn-icon" 
            title="상보성 vs 유사도 대조"
            style={{ color: '#818cf8' }}
          >
            <Split size={16} />
          </button>

          <button 
            onClick={() => setShowPrivacy(true)} 
            className="btn-icon" 
            title="정보공개 범위 대조"
            style={{ color: '#10b981' }}
          >
            <ShieldCheck size={16} />
          </button>

          {currentUser && (
            <button 
              onClick={() => setShowAdmin(!showAdmin)} 
              className="btn-icon" 
              title="운영진 대시보드"
              style={{ color: showAdmin ? '#ec4899' : 'var(--text-secondary)' }}
            >
              <BarChart3 size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Main Content View */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!currentUser ? (
          <JoinView onJoin={handleJoin} initialRoomCode="KOSS26" />
        ) : showAdmin ? (
          <AdminDashboard onBack={() => setShowAdmin(false)} roomCode={currentRoomCode} />
        ) : (
          <RoomView
            roomData={roomData}
            currentUser={currentUser}
            onUpdateStatus={handleUpdateStatus}
            onSimulatePeer={handleSimulatePeer}
            onOpenAdmin={() => setShowAdmin(true)}
            onLeave={handleLeave}
          />
        )}
      </main>

      {/* Modals */}
      {activeMatch && currentUser && (
        <MatchModal
          match={activeMatch}
          currentUser={currentUser}
          onReact={handleReactMatch}
          onClose={() => setActiveMatch(null)}
        />
      )}

      {showContrast && (
        <ContrastModal onClose={() => setShowContrast(false)} />
      )}

      {showPrivacy && (
        <PrivacyModal onClose={() => setShowPrivacy(false)} />
      )}

      {showQR && (
        <QRCodeModal roomCode={currentRoomCode} onClose={() => setShowQR(false)} />
      )}
    </div>
  );
}
