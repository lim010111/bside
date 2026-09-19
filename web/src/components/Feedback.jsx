import { useEffect, useState } from 'react';
import { useRoom } from '../use-room.js';

export function PageHeader({ title, eyebrow, onBack, action }) {
  return <header className="page-header">
    {eyebrow && <p className="eyebrow">{eyebrow}</p>}
    <div className="row">
      {onBack && <button type="button" className="icon-button" onClick={onBack} aria-label="뒤로"><svg className="ic lg" aria-hidden="true"><use href="#i-back" /></svg></button>}
      <h1 className="grow" tabIndex={-1}>{title}</h1>{action}
    </div>
  </header>;
}
export function ErrorNotice({ error, onRetry }) {
  if (!error) return null;
  return <div className="error-notice" role="alert"><p>{error.message || '요청을 처리하지 못했어요.'}</p>{onRetry && <button type="button" className="text-button" onClick={onRetry}>다시 시도</button>}</div>;
}
export function Loading({ text = '불러오는 중…' }) {
  return <div className="loading" role="status"><span className="spinner" aria-hidden="true" />{text}</div>;
}
export function EmptyState({ title, text, action, compact }) {
  return <div className={'empty' + (compact ? ' compact' : '')}><svg className="ic" aria-hidden="true"><use href="#i-inbox" /></svg><h2>{title}</h2>{text && <p className="dim">{text}</p>}{action}</div>;
}
export function Navigation() {
  const { state, actions } = useRoom();
  return <nav className="navigation" aria-label="행사 메뉴">{[['people', '사람들'], ['conversations', '대화']].map(([view, title]) => <button key={view} type="button" aria-current={state.view === view ? 'page' : undefined} onClick={() => actions.navigate(view)}>{title}{view === 'conversations' && state.conversations.length > 0 && <span>{state.conversations.length}</span>}</button>)}</nav>;
}
export function RecommendationRetry() {
  const { state, actions } = useRoom();
  const [time, setTime] = useState(Date.now);
  useEffect(() => {
    if (state.retryAt <= Date.now()) return;
    const timer = setInterval(() => setTime(Date.now()), 500);
    return () => clearInterval(timer);
  }, [state.retryAt]);
  const remaining = Math.max(0, Math.ceil((state.retryAt - time) / 1000));
  return <button className="text-button" disabled={remaining > 0} onClick={actions.retryRecommendations}>{remaining ? `${remaining}초 후 다시 시도` : '추천 다시 받기'}</button>;
}
