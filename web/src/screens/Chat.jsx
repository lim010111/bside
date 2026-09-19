import { useEffect, useLayoutEffect, useRef } from 'react';
import { useRoom } from '../use-room.js';
import { isDemo } from '../api/index.js';
import { lengthOf, LIMITS } from '../lib/contracts.js';
import { EmptyState, ErrorNotice, Loading, PageHeader } from '../components/Feedback.jsx';

export default function Chat() {
  const { state, actions } = useRoom();
  const { peer, targetId, messages, me } = state;
  const draft = state.drafts[targetId] ?? '';
  const pending = state.outbox[targetId];
  const sending = pending?.status === 'sending';
  const stopped = me.participation_status !== 'active' || peer?.participation_status === 'stopped';
  const count = lengthOf(draft.trim());
  const list = useRef(null), nearBottom = useRef(true), previous = useRef(null), prepend = useRef(null);
  useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    if (prepend.current) {
      node.scrollTop += node.scrollHeight - prepend.current;
      prepend.current = null;
    } else if (nearBottom.current || previous.current === null || messages.at(-1)?.sender_id === me.id) node.scrollTop = node.scrollHeight;
    previous.current = messages.at(-1)?.id ?? null;
  }, [messages, me.id]);
  useEffect(() => { if (pending?.status === 'failed') nearBottom.current = true; }, [pending?.status]);
  function submit(event) {
    event.preventDefault();
    if (stopped || sending || !count || count > LIMITS.text || !peer) return;
    // Preserve the request ID when retrying exactly the same failed message.
    void actions.send(draft, pending?.status === 'failed' && pending.text === draft.trim());
  }
  return <section className="screen screen-chat">
    <PageHeader title={peer?.nickname ?? '대화'} onBack={() => actions.navigate('conversations')} action={peer && <button className="text-button" onClick={() => actions.navigate('detail', peer.id)}>소개</button>} />
    <p className="sysline">{isDemo ? '보낸 내용은 이 브라우저에 저장돼요. 예시 참가자는 답장하지 않아요.' : '대화는 행사가 끝날 때까지 확인할 수 있어요.'}</p>
    {stopped && <p className="notice" role="status">참여 중단 중에는 이전 대화만 볼 수 있어요.</p>}
    <ErrorNotice error={state.chatError} onRetry={actions.loadChat} />
    <div className="bubbles" ref={list} role="log" aria-label="대화 내용" aria-live="polite" aria-relevant="additions text"
      onScroll={() => { const node = list.current; nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; }}>
      {state.hasOlder && <button className="text-button older-button" disabled={state.loadingOlder} onClick={() => { prepend.current = list.current.scrollHeight; void actions.loadOlder(); }}>이전 메시지 {state.loadingOlder ? '불러오는 중…' : '보기'}</button>}
      {state.chatLoading && !messages.length ? <Loading text="대화를 불러오고 있어요" /> : !messages.length && !state.chatError && <EmptyState title="첫 인사를 건네보세요" text="소개에서 궁금했던 이야기로 시작해도 좋아요." />}
      {messages.map((message) => <div key={message.id} className={'message-row ' + (message.sender_id === me.id ? 'mine' : '')}>
        <p className={'b ' + (message.sender_id === me.id ? 'me' : 'you')}><span className="sr-only">{message.sender_id === me.id ? '나' : peer?.nickname}: </span>{message.text}</p>
        <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time>
      </div>)}
    </div>
    {pending?.status === 'failed' && <div className="send-error" role="alert"><p>{pending.error.message}</p><p className="clamp-two">보내지 못한 내용: {pending.text}</p><button className="text-button" disabled={stopped} onClick={() => actions.send(pending.text, true)}>같은 메시지 재시도</button></div>}
    <form className="composer" onSubmit={submit}>
      <div className="grow"><label className="sr-only" htmlFor="message">메시지</label><textarea id="message" className="field" rows={2} placeholder={stopped ? '참여 중단 중에는 전송할 수 없어요' : '메시지를 입력하세요'} value={draft}
        disabled={sending || !peer || stopped} aria-describedby="message-count" aria-invalid={count > LIMITS.text}
        onChange={(event) => actions.setDraft(targetId, event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); submit(event); } }} />
        <span id="message-count" className={'counter' + (count > LIMITS.text ? ' danger' : '')}>{count} / 2,000 · Shift+Enter 줄바꿈</span>
      </div>
      <button className="send-button" type="submit" disabled={stopped || sending || !peer || !count || count > LIMITS.text} aria-label={sending ? '보내는 중' : '보내기'}>{sending ? '…' : <svg className="ic lg" aria-hidden="true"><use href="#i-send" /></svg>}</button>
    </form>
  </section>;
}
