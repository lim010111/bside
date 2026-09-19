import { useEffect, useLayoutEffect, useRef } from 'react';
import { useDiscovery } from '../use-discovery.js';
import { lengthOf, LIMITS } from '../lib/contracts.js';
import { useCountdown } from '../lib/use-countdown.js';
import { EmptyState, ErrorNotice, Loading, PageHeader } from '../components/Feedback.jsx';

export default function Chat() {
  const { state, actions } = useDiscovery();
  const { peer, targetId, messages, me } = state;
  const draft = state.drafts[targetId] ?? '';
  const pending = state.outbox[targetId];
  const sending = pending?.status === 'sending';
  const cooldown = useCountdown(pending?.retryAt);
  // An existing conversation outlives proximity and discovery OFF. Only a first
  // message to somebody new needs discovery on and a valid observation, and the
  // server is the one that decides that at save time.
  const started = Boolean(state.conversationId);
  const blocked = !started && !me.discovery_enabled;
  const count = lengthOf(draft.trim());
  const list = useRef(null), nearBottom = useRef(true), previous = useRef(null);
  useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    if (nearBottom.current || previous.current === null || messages.at(-1)?.sender_id === me.user_id) node.scrollTop = node.scrollHeight;
    previous.current = messages.at(-1)?.message_id ?? null;
  }, [messages, me.user_id]);
  useEffect(() => { if (pending?.status === 'failed') nearBottom.current = true; }, [pending?.status]);
  function submit(event) {
    event.preventDefault();
    if (blocked || sending || cooldown || !count || count > LIMITS.text || !peer) return;
    // Preserve the request ID when retrying exactly the same failed message.
    void actions.send(draft, pending?.status === 'failed' && pending.error?.code !== 'IDEMPOTENCY_CONFLICT' && pending.text === draft.trim());
  }
  return <section className="screen screen-chat">
    <PageHeader title={peer?.profile.nickname ?? '대화'} onBack={() => actions.navigate('conversations')} action={peer && <button className="text-button" onClick={() => actions.navigate('detail', peer.user_id)}>소개</button>} />
    {blocked && <p className="notice" role="status">주변 발견을 켜면 새 대화를 시작할 수 있어요.</p>}
    <ErrorNotice error={state.chatError} onRetry={actions.loadChat} />
    <div className="bubbles" ref={list} role="log" aria-label="대화 내용" aria-live="polite" aria-relevant="additions text"
      onScroll={() => { const node = list.current; nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; }}>
      {state.chatLoading && !messages.length ? <Loading text="대화를 불러오고 있어요" /> : !messages.length && !state.chatError && <EmptyState title="첫 인사를 건네보세요" text="소개에서 궁금했던 이야기로 시작해도 좋아요." />}
      {messages.map((message) => <div key={message.message_id} className={'message-row ' + (message.sender_id === me.user_id ? 'mine' : '')}>
        <p className={'b ' + (message.sender_id === me.user_id ? 'me' : 'you')}><span className="sr-only">{message.sender_id === me.user_id ? '나' : peer?.profile.nickname}: </span>{message.text}</p>
        <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time>
      </div>)}
    </div>
    {pending?.status === 'failed' && <div className="send-error" role="alert"><p>{pending.error.message}</p><p className="clamp-two">보내지 못한 내용: {pending.text}</p><button className="text-button" disabled={blocked || cooldown > 0} onClick={() => actions.send(pending.text, pending.error.code !== 'IDEMPOTENCY_CONFLICT')}>{cooldown ? `${cooldown}초 후 다시 시도` : pending.error.code === 'IDEMPOTENCY_CONFLICT' ? '새 메시지로 보내기' : '같은 메시지 재시도'}</button></div>}
    <form className="composer" onSubmit={submit}>
      <div className="grow"><label className="sr-only" htmlFor="message">메시지</label><textarea id="message" className="field" rows={2} placeholder={blocked ? '주변 발견을 켜면 보낼 수 있어요' : '메시지를 입력하세요'} value={draft}
        disabled={sending || !peer || blocked} aria-describedby="message-count" aria-invalid={count > LIMITS.text}
        onChange={(event) => actions.setDraft(targetId, event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); submit(event); } }} />
        <span id="message-count" className={'counter' + (count > LIMITS.text ? ' danger' : '')}>{count} / 2,000 · Shift+Enter 줄바꿈</span>
      </div>
      <button className="send-button" type="submit" disabled={blocked || sending || cooldown > 0 || !peer || !count || count > LIMITS.text} aria-label={sending ? '보내는 중' : '보내기'}>{sending ? '…' : <svg className="ic lg" aria-hidden="true"><use href="#i-send" /></svg>}</button>
    </form>
  </section>;
}
