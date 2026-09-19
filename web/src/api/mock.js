import { ROOMS } from './seeds.js';
import { ApiError, baseOrder, lengthOf, validateProfile } from '../lib/contracts.js';

// Browser-only demo. Isolated v2 keys leave existing prototype data untouched.
// No fake incoming messages. This does not simulate a multi-device server.
export function createMockApi({ storage = () => globalThis.localStorage, sessionKey = 'bside:demo:v2:session', seeded = true } = {}) {
  const listeners = new Set();
  const key = (code) => 'bside:demo:v2:room:' + code;
  const uuid = () => globalThis.crypto.randomUUID();
  const fail = (code, message, extra) => { throw new ApiError(code, message, extra); };
  function read(name) {
    try { return JSON.parse(storage().getItem(name) || 'null'); }
    catch { return fail('STORAGE_UNAVAILABLE', '브라우저 저장 공간을 사용할 수 없어요. 사이트 저장 권한을 확인해 주세요.'); }
  }
  function write(name, value) {
    try { storage().setItem(name, JSON.stringify(value)); }
    catch { fail('STORAGE_UNAVAILABLE', '내용을 저장하지 못했어요. 저장 공간을 확인하고 다시 시도해 주세요.'); }
  }
  function room(code) {
    if (!Object.hasOwn(ROOMS, code)) fail('NOT_FOUND', '행사를 찾을 수 없어요. 초대 링크를 다시 확인해 주세요.');
    let data = read(key(code));
    if (!data) {
      const members = {};
      if (seeded) for (const [index, person] of ROOMS[code].seed().entries()) {
        members[person.id] = {
          id: person.id, room_id: code, nickname: person.name,
          self_description: person.self, connection_intent: person.intent,
          profile_version: 1, participation_status: 'active',
          joined_at: new Date(Date.UTC(2026, 8, 19, 0, 0, index)).toISOString(),
        };
      }
      data = { id: code, name: ROOMS[code].title, status: 'open', closed_at: null,
        candidate_version: 1, members, sessions: {}, conversations: {} };
      write(key(code), data);
    }
    return data;
  }
  function open(code) {
    const data = room(code);
    if (data.status === 'closed') fail('ROOM_CLOSED', '행사가 종료됐어요.');
    return data;
  }
  function identify(data, required = true) {
    const id = data.sessions[read(sessionKey)];
    const me = data.members[id] ?? null;
    if (!me && required) fail('PARTICIPATION_REQUIRED', '먼저 참여 정보를 입력해 주세요.');
    return me;
  }
  function auth(code) {
    const data = open(code);
    return { data, me: identify(data) };
  }
  function emit(code, type, data = {}) {
    queueMicrotask(() => { for (const listener of listeners) if (listener.code === code) listener.callback({ type, data }); });
  }
  function changed(data, self = false) {
    write(key(data.id), data);
    emit(data.id, 'participants.changed', { candidate_version: data.candidate_version });
    if (self) emit(data.id, 'self.changed');
  }
  // 데모용 규칙 추천기다. 모델 호출이 아니다 — 발표에서도 그렇게 말한다.
  //
  // 활용형을 정규식에 나열하지 않는다. `막힌`을 빠뜨려서 씨드 45명이 한 명도
  // 추천되지 않은 적이 있다. 어간까지만 적고 어미는 흘려보낸다.
  const ASKS = /막히|막힌|막혀|막혔|모르|어렵|어려|헤매|궁금|찾|도움|필요|배우|알고 싶|보고 싶|익숙한 분|처음|계실까요|있나요|있을까요|주실|봐주|물어보|여쭤/;
  const OFFERS = /해봤|해봅|구축|경험|자신|물어보셔도|물어봐 주|도와|알려|설명|봐드|나누|공유|잡아봤|통과시켜|만들어봤|할 줄|많이 했|오래 했|좀 합니다|드릴|드려|가능해|가능합/;
  // 낱말이 정확히 겹치는 일은 드물다. 주제로 묶어야 추천이 사람 수만큼 나온다.
  const TOPICS = [
    ['배포와 인프라', ['도커', 'CI', '배포', 'AWS', '빌드', '파이프라인', '서버', '인증', 'OAuth', 'Firebase', '권한']],
    ['프론트엔드', ['React', '리액트', '타입스크립트', '제네릭', '상태관리', '웹소켓', 'SSE', '소켓', '통신']],
    ['디자인', ['디자인', '피그마', '토큰', '일러스트', '아이콘', '프로토타입', '오토레이아웃']],
    ['기획과 제품', ['기획', 'PM', '기획서', '제품', '논문', 'NLP']],
    ['발표 준비', ['발표', '대본', '자료', '심사', '대회']],
    ['팀 구성', ['팀원', '팀 ', '팀이', '팀을']],
    ['첫 참가', ['처음', '비전공', '부트캠프', '편입', '1학년', '3학년', '구경', '익숙한', '분위기', '혼자', '아는 사람']],
    ['모바일', ['안드로이드', '앱 스토어', '스토어']],
    ['데이터', ['파이썬', '크롤링', '지도', 'API']],
    ['협업 도구', ['테스트', '깃', '충돌']],
  ];
  const wrote = (person) => person.self_description + ' ' + person.connection_intent;
  function sharedTopic(viewer, candidate) {
    const mine = wrote(viewer), theirs = wrote(candidate);
    const hit = TOPICS.find(([, words]) => words.some((w) => mine.includes(w)) && words.some((w) => theirs.includes(w)));
    return hit ? hit[0] : null;
  }
  function reason(viewer, candidate) {
    if (candidate.participation_status !== 'active') return { state: 'unavailable', reason: null };
    // 상보성: 한쪽이 찾고 다른 쪽이 내어줄 때 성립한다. 방향은 양쪽 다 본다.
    const complementary = (ASKS.test(wrote(viewer)) && OFFERS.test(wrote(candidate)))
      || (OFFERS.test(wrote(viewer)) && ASKS.test(wrote(candidate)));
    const topic = complementary ? sharedTopic(viewer, candidate) : null;
    return { state: topic ? 'ready' : 'unscored',
      // 근거는 상대가 실제로 쓴 원문에서 가져온다. 지어내지 않는다.
      reason: topic ? candidate.nickname + '님의 "' + candidate.self_description + '"가 지금 찾으시는 것과 맞아 보여요.' : null,
      viewer_profile_version: viewer.profile_version, candidate_profile_version: candidate.profile_version };
  }
  function candidates(data, me) {
    return Object.values(data.members).filter((p) => p.id !== me.id && p.participation_status === 'active').sort(baseOrder);
  }
  function checkProfile(payload, editing = false) {
    const fields = validateProfile(payload, editing);
    if (Object.keys(fields).length) fail('INVALID_INPUT', '입력 내용을 확인해 주세요.', { fields });
  }
  function participation(code, status) {
    const { data, me } = auth(code);
    if (me.participation_status !== status) {
      me.participation_status = status;
      data.candidate_version++;
      changed(data, true);
    }
    return me;
  }
  return {
    async ensureSession() {
      if (!read(sessionKey)) write(sessionKey, uuid());
      return { ready: true };
    },
    async getRoom(code) {
      const { id, name, status, closed_at } = room(code);
      return { id, name, status, closed_at };
    },
    async getMe(code) { return identify(open(code), false); },
    async join(code, payload) {
      const data = open(code);
      const session = read(sessionKey);
      if (!session) fail('SESSION_REQUIRED', '브라우저 세션을 다시 확인해 주세요.');
      const existing = identify(data, false);
      if (existing) return existing;
      checkProfile(payload);
      const me = { id: uuid(), room_id: code, nickname: payload.nickname.trim(),
        self_description: payload.self_description.trim(), connection_intent: payload.connection_intent.trim(),
        participation_status: 'active', profile_version: 1, joined_at: new Date().toISOString() };
      data.members[me.id] = me;
      data.sessions[session] = me.id;
      data.candidate_version++;
      changed(data);
      return me;
    },
    async updateMe(code, payload) {
      const { data, me } = auth(code);
      if (payload.expected_profile_version !== me.profile_version) fail('VERSION_CONFLICT', '다른 화면에서 정보가 변경됐어요. 최신 정보를 확인한 뒤 다시 저장해 주세요.');
      checkProfile(payload, true);
      const self = payload.self_description.trim(), intent = payload.connection_intent.trim();
      if (self !== me.self_description || intent !== me.connection_intent) {
        Object.assign(me, { self_description: self, connection_intent: intent, profile_version: me.profile_version + 1 });
        data.candidate_version++;
        changed(data, true);
      }
      return me;
    },
    async stop(code) { return participation(code, 'stopped'); },
    async resume(code) { return participation(code, 'active'); },
    async getParticipants(code) {
      const { data, me } = auth(code);
      return { candidate_version: data.candidate_version, recommendation_state: 'ready',
        items: candidates(data, me).map((p) => ({
          id: p.id, nickname: p.nickname, self_description: p.self_description,
          profile_version: p.profile_version, joined_at: p.joined_at, evaluation_state: reason(me, p).state,
        })) };
    },
    async getRecommendations(code) {
      const { data, me } = auth(code);
      return { candidate_version: data.candidate_version, state: 'ready',
        ordered_evaluated_ids: candidates(data, me).filter((p) => reason(me, p).state === 'ready').map((p) => p.id) };
    },
    async refreshRecommendations(code) {
      const { data } = auth(code);
      emit(code, 'recommendation.changed', { candidate_version: data.candidate_version, state: 'ready' });
      return { candidate_version: data.candidate_version, state: 'ready' };
    },
    async getParticipant(code, id) {
      const { data, me } = auth(code);
      const participant = data.members[id];
      if (!participant || participant.id === me.id) fail('NOT_FOUND', '참가자를 찾을 수 없어요.');
      return { participant, recommendation: reason(me, participant) };
    },
    async getConversations(code) {
      const { data, me } = auth(code);
      return { items: Object.values(data.conversations).filter((c) => c.people.includes(me.id)).map((c) => ({
        id: c.id, peer: data.members[c.people.find((id) => id !== me.id)],
        last_seq: c.messages.length, last_message: c.messages.at(-1),
      })).sort((a, b) => b.last_message.created_at.localeCompare(a.last_message.created_at)) };
    },
    async sendMessage(code, payload) {
      const { data, me } = auth(code);
      const peer = data.members[payload.recipient_id];
      if (!peer || peer.id === me.id) fail('NOT_FOUND', '참가자를 찾을 수 없어요.');
      const text = payload.text.trim();
      if (!text || lengthOf(text) > 2000 || !payload.client_message_id || payload.client_message_id.length > 64) fail('INVALID_INPUT', '메시지는 1~2,000자로 입력해 주세요.');
      const all = Object.values(data.conversations);
      const previous = all.flatMap((c) => c.messages).find((m) => m.sender_id === me.id && m.client_message_id === payload.client_message_id);
      if (previous) {
        const conversation = all.find((c) => c.id === previous.conversation_id);
        if (previous.text !== text || !conversation.people.includes(peer.id)) fail('IDEMPOTENCY_CONFLICT', '같은 전송 요청의 내용이 달라졌어요.');
        return { message: previous, replayed: true };
      }
      if (me.participation_status !== 'active' || peer.participation_status !== 'active') fail('PARTICIPATION_STOPPED', '참여 중단 중에는 새 메시지를 주고받을 수 없어요.');
      let conversation = all.find((c) => c.people.includes(me.id) && c.people.includes(peer.id));
      if (!conversation) {
        conversation = { id: uuid(), people: [me.id, peer.id].sort(), messages: [] };
        data.conversations[conversation.id] = conversation;
      }
      const message = { id: uuid(), conversation_id: conversation.id, seq: conversation.messages.length + 1,
        sender_id: me.id, client_message_id: payload.client_message_id, text, created_at: new Date().toISOString() };
      conversation.messages.push(message);
      write(key(code), data);
      emit(code, 'conversation.changed', { conversation_id: conversation.id, latest_seq: message.seq });
      return { message, replayed: false };
    },
    async getMessages(code, id, query = {}) {
      const { data, me } = auth(code);
      const conversation = data.conversations[id];
      if (!conversation?.people.includes(me.id)) fail('NOT_FOUND', '대화를 찾을 수 없어요.');
      const { after_seq, before_seq, limit = 50 } = query;
      if ((after_seq !== undefined && before_seq !== undefined) || limit < 1 || limit > 100) fail('INVALID_INPUT', '이력 조회 범위를 확인해 주세요.');
      const matching = conversation.messages.filter((m) => (after_seq === undefined || m.seq > after_seq) && (before_seq === undefined || m.seq < before_seq));
      const items = after_seq === undefined ? matching.slice(-limit) : matching.slice(0, limit);
      return { items, has_more: matching.length > items.length, next_after_seq: items.at(-1)?.seq ?? null,
        next_before_seq: items[0]?.seq ?? null, latest_seq: conversation.messages.length };
    },
    subscribe(code, callback, onError) {
      const listener = { code, callback };
      listeners.add(listener);
      let alive = true;
      const ready = () => {
        try {
          const data = room(code);
          callback({ type: data.status === 'closed' ? 'room.closed' : 'ready', data: { room_status: data.status, candidate_version: data.candidate_version } });
        } catch { onError(); }
      };
      const onStorage = (event) => { if (event.key === key(code)) ready(); };
      globalThis.addEventListener?.('storage', onStorage);
      queueMicrotask(() => { if (alive) ready(); });
      return () => { alive = false; listeners.delete(listener); globalThis.removeEventListener?.('storage', onStorage); };
    },
    // Only exported by the demo adapter for local verification, never a production admin endpoint.
    async closeRoom(code) {
      const data = room(code);
      data.status = 'closed';
      data.closed_at ??= new Date().toISOString();
      data.members = {}; data.conversations = {}; data.sessions = {};
      write(key(code), data);
      emit(code, 'room.closed', { closed_at: data.closed_at });
    },
  };
}
