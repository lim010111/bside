import React, { useState, useEffect, useRef } from 'react';
import JoinView from './components/JoinView';
import RoomView from './components/RoomView';
import MatchModal from './components/MatchModal';
import BLEChatModal from './components/BLEChatModal';
import AdminDashboard from './components/AdminDashboard';
import ContrastModal from './components/ContrastModal';
import PrivacyModal from './components/PrivacyModal';
import QRCodeModal from './components/QRCodeModal';
import { Sliders, ShieldCheck, Split, QrCode } from 'lucide-react';

const ROOMS_CONFIG = {
  KOSS26: {
    code: 'KOSS26',
    title: '코쓱톤 네트워킹',
    when: '국민대 미래관 4층 · 오늘 18:00까지',
    affLabel: '소속',
    affOptions: ['국민대', '숭실대', '순천향대'],
  },
  FEMEETUP: {
    code: 'FEMEETUP',
    title: '서울 프론트엔드 밋업',
    when: '성수 코워킹 · 오늘 21:00까지',
    affLabel: '회사',
    affOptions: null,
  },
};

export default function App() {
  const [currentRoomCode, setCurrentRoomCode] = useState('KOSS26');
  const [currentUser, setCurrentUser] = useState(null);
  const [screen, setScreen] = useState('entry'); // 'entry' | 'room' | 'chat' | 'admin'
  const [isEditing, setIsEditing] = useState(false);

  const [roomData, setRoomData] = useState(null);
  const [activeMatch, setActiveMatch] = useState(null);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [chatPartner, setChatPartner] = useState(null);

  const [matchState, setMatchState] = useState('');
  const [btEnabled, setBtEnabled] = useState(true);

  // Modals
  const [showContrast, setShowContrast] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [devMenuOpen, setDevMenuOpen] = useState(false);

  const eventSourceRef = useRef(null);

  // Initial fetch of room data
  const loadRoom = async (code) => {
    try {
      const res = await fetch(`/api/room/${code}`);
      if (res.ok) {
        const data = await res.json();
        setRoomData(data);
      }
    } catch (e) {
      console.warn('Failed to load room data:', e);
    }
  };

  useEffect(() => {
    loadRoom(currentRoomCode);
  }, [currentRoomCode]);

  // SSE Stream
  useEffect(() => {
    if (!currentUser?.id || !currentRoomCode) return;

    const sseUrl = `/api/room/${currentRoomCode}/stream`;
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

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

    return () => {
      es.close();
    };
  }, [currentUser?.id, currentRoomCode]);

  // Join or Update Profile
  const handleJoinOrUpdate = async ({ nick, school, status, note }) => {
    if (isEditing && currentUser?.id) {
      // Profile update
      try {
        const res = await fetch(`/api/room/${currentRoomCode}/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: currentUser.id,
            nick,
            school,
            status,
            note,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentUser((prev) => ({
            ...prev,
            nick,
            name: nick,
            school,
            status,
            st: status,
            note,
          }));
        }
      } catch (err) {
        console.warn('Update failed, updating locally:', err);
      }
      setIsEditing(false);
      setScreen('room');
      return;
    }

    // New Join
    try {
      const res = await fetch(`/api/room/${currentRoomCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nick, school, status, note }),
      });
      const data = await res.json();
      const user = {
        id: data.id,
        nick,
        name: nick,
        school,
        status,
        st: status,
        note,
        roomCode: currentRoomCode,
        age: 0,
      };
      setCurrentUser(user);
      setScreen('room');
      runMatchFlow(user);
    } catch (err) {
      // Offline fallback
      const user = {
        id: 'me',
        nick,
        name: nick,
        school,
        status,
        st: status,
        note,
        roomCode: currentRoomCode,
        age: 0,
      };
      setCurrentUser(user);
      setScreen('room');
      runMatchFlow(user);
    }
  };

  // Run Match flow with realistic delay
  const runMatchFlow = (user = currentUser) => {
    const total = (roomData?.members?.length || 45) + 1;
    setMatchState(`${total}명 중에서 찾는 중`);
    setTimeout(() => {
      setMatchState('');
      setActiveMatch({
        id: 'demo_match',
        seeker_id: user?.id || 'me',
        seeker_nick: user?.nick || '지원',
        helper_id: 'minseo',
        helper_nick: '민서',
        helper_school: '순천향대',
        helper_near: true,
        strength: 0.85,
        why_a: user?.note ? `${user.note.slice(0, 18)}을 찾는 중` : '배포·CI 경험을 찾는 중',
        why_b: '작년에 CI 파이프라인 구축',
        opener: '혹시 CI 구축해보셨다고 들었어요. 저 지금 배포 권한에서 막혀 있는데요.',
      });
    }, 1800);
  };

  // Dev Scenario Switcher (11 PRD demo modes)
  const handleDevMode = (m) => {
    setDevMenuOpen(false);
    setActiveMatch(null);
    setSelectedPartner(null);
    setMatchState('');
    setBtEnabled(true);

    if (m === 'flow') {
      setCurrentRoomCode('KOSS26');
      setCurrentUser(null);
      setIsEditing(false);
      setScreen('entry');
      return;
    }

    if (m === 'room2') {
      setCurrentRoomCode('FEMEETUP');
      setCurrentUser(null);
      setIsEditing(false);
      setScreen('entry');
      return;
    }

    // Preset user "지원"
    const jiwon = {
      id: 'me',
      nick: '지원',
      name: '지원',
      school: '국민대',
      status: 'LOOKING_FOR',
      st: 'LOOKING_FOR',
      note: '배포·CI 경험 있으신 분 찾아요',
      roomCode: currentRoomCode,
      age: 0,
    };
    setCurrentUser(jiwon);

    if (m === 'room') {
      setScreen('room');
    } else if (m === 'match') {
      setScreen('room');
      setActiveMatch({
        id: 'demo_match',
        seeker_id: 'me',
        seeker_nick: '지원',
        helper_id: 'minseo',
        helper_nick: '민서',
        helper_school: '순천향대',
        helper_near: true,
        strength: 0.85,
        why_a: '배포·CI 경험을 찾는 중',
        why_b: '작년에 CI 파이프라인 구축',
        opener: '혹시 CI 구축해보셨다고 들었어요. 저 지금 배포 권한에서 막혀 있는데요.',
      });
    } else if (m === 'none') {
      setScreen('room');
      setActiveMatch({ isNone: true });
    } else if (m === 'empty') {
      setRoomData((prev) => ({ ...prev, members: [], total_active: 1 }));
      setScreen('room');
    } else if (m === 'loading') {
      setScreen('room');
      runMatchFlow(jiwon);
    } else if (m === 'btoff') {
      setBtEnabled(false);
      setChatPartner({ id: 'minseo', name: '민서', school: '순천향대' });
      setScreen('chat');
    } else if (m === 'longtext') {
      setCurrentUser({
        ...jiwon,
        name: '김지원국민대소프트웨어학부',
        nick: '김지원국민대소프트웨어학부',
        note: '배포랑 CI 쪽 경험 있으신 분 찾고 있어요. GitHub Actions에서 빌드까지는 통과하는데 배포 단계에서 권한 오류가 계속 나서 어제부터 붙잡고 있는데 도저히 안 풀리네요. 혹시 비슷한 거 겪어보신 분 계실까요',
      });
      setScreen('room');
    } else if (m === 'dash') {
      setScreen('admin');
    } else if (m === 'expire') {
      setCurrentUser((prev) => ({ ...prev, age: 280 }));
      setScreen('room');
    }
  };

  return (
    <div className="app-shell" id="app">
      {/* Top Utility Bar for Presentation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          fontSize: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-dim)' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--sharing)',
              display: 'inline-block',
            }}
          />
          Bside · 실시간 P2P
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowContrast(true)}
            className="row"
            style={{ gap: '3px', color: 'var(--text-dim)', fontSize: '11px' }}
            title="기존 유사도 매칭 vs Bside 상보 매칭 대조표"
          >
            <Split size={12} /> 상보 대조
          </button>
          <button
            onClick={() => setShowPrivacy(true)}
            className="row"
            style={{ gap: '3px', color: 'var(--text-dim)', fontSize: '11px' }}
            title="개인정보 0 서버 소멸 아키텍처"
          >
            <ShieldCheck size={12} /> 소멸 보안
          </button>
          <button
            onClick={() => setShowQR(true)}
            className="row"
            style={{ gap: '3px', color: 'var(--text-dim)', fontSize: '11px' }}
            title="행사장 입장 QR 코드"
          >
            <QrCode size={12} /> QR
          </button>
        </div>
      </div>

      {/* Main Screen View Router */}
      {screen === 'entry' && (
        <JoinView
          roomCode={currentRoomCode}
          initialData={isEditing ? currentUser : null}
          isEditing={isEditing}
          roomMeta={ROOMS_CONFIG[currentRoomCode]}
          onBackToRoom={() => {
            setIsEditing(false);
            setScreen('room');
          }}
          onJoin={handleJoinOrUpdate}
        />
      )}

      {screen === 'room' && (
        <RoomView
          roomData={roomData}
          currentUser={currentUser}
          matchState={matchState}
          onRunMatch={() => runMatchFlow(currentUser)}
          onEditMine={() => {
            setIsEditing(true);
            setScreen('entry');
          }}
          onOpenAdmin={() => setScreen('admin')}
          onLeave={() => {
            setCurrentUser(null);
            setScreen('entry');
          }}
          onSelectMemberForMatch={(member) => {
            setSelectedPartner(member);
          }}
        />
      )}

      {screen === 'chat' && (
        <BLEChatModal
          partner={chatPartner}
          currentUser={currentUser}
          btEnabled={btEnabled}
          onToggleBt={(val) => setBtEnabled(val)}
          onBack={() => setScreen('room')}
        />
      )}

      {screen === 'admin' && (
        <AdminDashboard
          roomCode={currentRoomCode}
          onBack={() => setScreen('room')}
          onOpenQR={() => setShowQR(true)}
        />
      )}

      {/* Touchpoint Sheet (MatchModal) */}
      {(activeMatch || selectedPartner) && (
        <MatchModal
          match={activeMatch}
          partner={selectedPartner}
          currentUser={currentUser}
          totalCount={roomData?.total_active || 46}
          onClose={() => {
            setActiveMatch(null);
            setSelectedPartner(null);
          }}
          onStartChat={(partner) => {
            setActiveMatch(null);
            setSelectedPartner(null);
            setChatPartner(partner);
            setScreen('chat');
          }}
        />
      )}

      {/* Auxiliary Modals */}
      {showContrast && <ContrastModal onClose={() => setShowContrast(false)} />}
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
      {showQR && <QRCodeModal roomCode={currentRoomCode} onClose={() => setShowQR(false)} />}

      {/* Dev Demo Scenario Switcher */}
      <div id="dev">
        <button
          id="devbtn"
          aria-label="데모 상태 전환"
          onClick={() => setDevMenuOpen(!devMenuOpen)}
        >
          <Sliders size={18} />
        </button>

        {devMenuOpen && (
          <div id="devmenu">
            <button onClick={() => handleDevMode('flow')}>처음부터 (입장)</button>
            <button onClick={() => handleDevMode('room2')}>다른 행사로 (밋업)</button>
            <button onClick={() => handleDevMode('room')}>방 · 기본 (46명)</button>
            <button onClick={() => handleDevMode('match')}>접점 카드 열기</button>
            <button onClick={() => handleDevMode('none')}>접점 없음</button>
            <hr />
            <button onClick={() => handleDevMode('empty')}>방이 텅 빔</button>
            <button onClick={() => handleDevMode('loading')}>매칭 중</button>
            <button onClick={() => handleDevMode('btoff')}>블루투스 꺼짐</button>
            <button onClick={() => handleDevMode('longtext')}>긴 텍스트</button>
            <hr />
            <button onClick={() => handleDevMode('dash')}>운영진 대시보드</button>
            <button onClick={() => handleDevMode('expire')}>만료 빨리감기</button>
          </div>
        )}
      </div>
    </div>
  );
}
