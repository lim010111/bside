import React, { useState, useEffect } from 'react';
import { Search, MessageSquare, Hand, Circle, ArrowLeft } from 'lucide-react';

const STATUSES = [
  { k: 'LOOKING_FOR', label: '이런 분 찾아요', icon: Search, ph: '배포·CI 경험 있으신 분 찾아요' },
  { k: 'CAN_SHARE', label: '이런 얘기 할 수 있어요', icon: MessageSquare, ph: '작년에 도커로 CI 파이프라인 구축해봤어요' },
  { k: 'FIRST_TIME', label: '처음 왔어요', icon: Hand, ph: '혼자 왔어요. 기획하다가 백엔드가 궁금해졌어요' },
  { k: 'OPEN', label: '대화 가능', icon: Circle, ph: '뭐든 편하게 말 걸어주세요' },
];

const DEFAULT_OPTIONS = ['국민대', '숭실대', '순천향대'];

export default function JoinView({
  onJoin,
  roomCode = 'KOSS26',
  initialData = null,
  isEditing = false,
  onBackToRoom = null,
  roomMeta = null,
}) {
  const [nick, setNick] = useState(initialData?.nick || initialData?.name || '');
  const [schoolSelect, setSchoolSelect] = useState(() => {
    if (!initialData?.school) return '국민대';
    return DEFAULT_OPTIONS.includes(initialData.school) ? initialData.school : '__other';
  });
  const [schoolOther, setSchoolOther] = useState(() => {
    if (!initialData?.school) return '';
    return DEFAULT_OPTIONS.includes(initialData.school) ? '' : initialData.school;
  });

  const [status, setStatus] = useState(initialData?.st || initialData?.status || 'LOOKING_FOR');
  const [note, setNote] = useState(initialData?.note || '배포·CI 경험 있으신 분 찾아요');
  const [error, setError] = useState('');
  const [teaser, setTeaser] = useState(null);

  useEffect(() => {
    fetch(`/api/room/${roomCode}/teaser`)
      .then((res) => res.json())
      .then((data) => setTeaser(data))
      .catch((err) => console.warn('Teaser fetch failed:', err));
  }, [roomCode]);

  useEffect(() => {
    if (initialData) {
      setNick(initialData.nick || initialData.name || '');
      const s = initialData.school || '국민대';
      if (DEFAULT_OPTIONS.includes(s)) {
        setSchoolSelect(s);
        setSchoolOther('');
      } else {
        setSchoolSelect('__other');
        setSchoolOther(s);
      }
      setStatus(initialData.st || initialData.status || 'LOOKING_FOR');
      setNote(initialData.note || '');
    }
  }, [initialData]);

  const currentSchool = schoolSelect === '__other' ? schoolOther.trim() : schoolSelect;
  const currentPlaceholder = STATUSES.find((s) => s.k === status)?.ph || '';

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!nick.trim()) {
      setError('닉네임을 입력해 주세요');
      return;
    }
    if (!currentSchool) {
      setError('소속을 입력해 주세요');
      return;
    }
    if (!status) {
      setError('상태를 하나 골라주세요');
      return;
    }
    if (!note.trim()) {
      setError('한 줄만 적어주세요. 이게 있어야 이어드릴 수 있어요');
      return;
    }

    setError('');
    onJoin({
      nick: nick.trim(),
      school: currentSchool,
      status,
      note: note.trim(),
    });
  };

  const attendeesCount = teaser?.total_attendees || 45;
  const compo = teaser?.compo || [
    { key: 'LOOKING_FOR', pct: 26.7 },
    { key: 'CAN_SHARE', pct: 33.3 },
    { key: 'FIRST_TIME', pct: 22.2 },
    { key: 'OPEN', pct: 17.8 },
  ];
  const tally = teaser?.tally || '찾는 중 12 · 나눌 수 있음 15 · 처음 10 · 대화 가능 8';

  return (
    <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* S2 Header */}
      <header style={{ padding: '16px 0 12px' }}>
        <div className="row" style={{ justifyContent: 'space-between', minHeight: '22px' }}>
          {isEditing && onBackToRoom ? (
            <button
              onClick={onBackToRoom}
              className="row"
              style={{ gap: '4px', fontSize: '12px', color: 'var(--text-dim)', padding: 0 }}
            >
              <ArrowLeft size={14} /> 방으로
            </button>
          ) : (
            <span className="t-sm faint" style={{ fontWeight: 500, letterSpacing: '-.02em' }}>
              Bside
            </span>
          )}
          <span className="t-sm faint">
            {roomMeta?.when || teaser?.when?.split(' · ').pop() || '오늘 18:00까지'}
          </span>
        </div>
        <h1 className="t-xl" style={{ margin: '10px 0 0' }}>
          {roomMeta?.title || teaser?.title || '코쓱톤 네트워킹'}
        </h1>
        <p className="t-sm dim" style={{ margin: '5px 0 0' }}>
          지금 {attendeesCount}명이 상태를 올려뒀어요
        </p>
      </header>

      {/* Composition Bar & Tally */}
      <div className="compo">
        {compo.map((c) => (
          <i
            key={c.key}
            className={`bar-${c.key}`}
            style={{ width: `${c.pct}%` }}
            title={`${c.key}: ${c.pct}%`}
          />
        ))}
      </div>
      <div className="stats">{tally}</div>

      {/* Gate Message */}
      <p className="t-sm faint" style={{ margin: '10px 0 0', lineHeight: 1.55 }}>
        한 줄을 올리면 {attendeesCount}명이 뭘 찾고 있는지 보입니다.
      </p>
      <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0 2px' }} />

      {/* Form Area */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingBottom: '20px' }}>
        <div className="row" style={{ gap: '8px', alignItems: 'flex-start', marginTop: '14px' }}>
          <div className="grow">
            <label className="t-sm dim" htmlFor="nick">
              닉네임
            </label>
            <input
              id="nick"
              className="field"
              style={{ marginTop: '5px' }}
              maxLength={12}
              placeholder="지원"
              autoComplete="off"
              value={nick}
              onChange={(e) => {
                setNick(e.target.value);
                if (error) setError('');
              }}
            />
          </div>

          <div className="grow">
            <label className="t-sm dim" htmlFor="aff">
              소속
            </label>
            <div style={{ marginTop: '5px' }}>
              <select
                id="aff"
                className="field"
                value={schoolSelect}
                onChange={(e) => {
                  setSchoolSelect(e.target.value);
                  if (error) setError('');
                }}
              >
                {DEFAULT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
                <option value="__other">직접 입력</option>
              </select>
            </div>
          </div>
        </div>

        {schoolSelect === '__other' && (
          <div style={{ marginTop: '8px' }}>
            <input
              className="field"
              maxLength={20}
              placeholder="소속을 입력해 주세요 (예: 서울대, 카이스트)"
              autoComplete="off"
              value={schoolOther}
              onChange={(e) => {
                setSchoolOther(e.target.value);
                if (error) setError('');
              }}
              autoFocus
            />
          </div>
        )}

        <p className="t-sm dim" style={{ margin: '18px 0 7px' }}>
          지금 무엇을 찾고 계세요?
        </p>

        {/* 4-card Status Picker */}
        <div className="picks">
          {STATUSES.map((s) => {
            const IconComp = s.icon;
            const isSelected = status === s.k;
            return (
              <button
                key={s.k}
                type="button"
                className={`pick s-${s.k}`}
                aria-pressed={isSelected}
                onClick={() => {
                  setStatus(s.k);
                  if (error) setError('');
                }}
              >
                <IconComp className="ic" size={18} />
                <b>{s.label}</b>
              </button>
            );
          })}
        </div>

        {/* One-liner Note Textarea */}
        <div style={{ marginTop: '14px' }}>
          <textarea
            id="note"
            className="field"
            maxLength={140}
            placeholder={currentPlaceholder}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (error) setError('');
            }}
          />
          <div className="row" style={{ justifyContent: 'space-between', marginTop: '4px' }}>
            <span className="err" style={{ margin: 0 }}>
              {error}
            </span>
            <span className="t-sm faint">{note.length} / 140</span>
          </div>
        </div>

        {/* Action Button */}
        <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
          <button type="submit" className="btn">
            {isEditing ? '수정 완료' : '올리기'}
          </button>
        </div>
      </form>
    </div>
  );
}
