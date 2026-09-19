import { SEED_NEARBY } from './seeds.js';
import { ApiError, lengthOf, validateProfile } from '../lib/contracts.js';

// Browser-only demo of the SERVER, not of the radio. It has no BLE: it stands in for
// what the server would know after Kotlin reported observations. Seeded people never
// reply — there is no second device here.
//
// Isolated v3 keys leave earlier prototype data untouched.
export const OBSERVATION_TTL = 120000;

export function createMockApi({ storage = () => globalThis.localStorage, installKey = 'bside:demo:v3:install', seeded = true, now = Date.now } = {}) {
  const listeners = new Set();
  const STATE = 'bside:demo:v3:state';
  const uuid = () => globalThis.crypto.randomUUID();
  const fail = (code, message, extra) => { throw new ApiError(code, message, extra); };
  const stamp = (offset = 0) => new Date(now() - offset).toISOString();
  function read(name) {
    try { return JSON.parse(storage().getItem(name) || 'null'); }
    catch { return fail('STORAGE_UNAVAILABLE', '브라우저 저장 공간을 사용할 수 없어요. 사이트 저장 권한을 확인해 주세요.'); }
  }
  function write(name, value) {
    try { storage().setItem(name, JSON.stringify(value)); }
    catch { fail('STORAGE_UNAVAILABLE', '내용을 저장하지 못했어요. 저장 공간을 확인하고 다시 시도해 주세요.'); }
  }
  function load() {
    let data = read(STATE);
    if (!data) {
      const people = {};
      if (seeded) for (const person of SEED_NEARBY) {
        people[person.id] = {
          user_id: person.id, nickname: person.name, self_description: person.self,
          connection_intent: person.intent, profile_revision: 1,
          discovery_enabled: true, discovery_revision: 1, seed_age: person.age,
        };
      }
      data = { people, installs: {}, observations: {}, conversations: {}, nearby_version: 1 };
      write(STATE, data);
    }
    return data;
  }
  function save(data) { write(STATE, data); }
  function identify(data, required = true) {
    const me = data.people[data.installs[read(installKey)]] ?? null;
    if (!me && required) fail('PROFILE_REQUIRED', '먼저 내 소개를 입력해 주세요.');
    return me;
  }
  function auth() {
    const data = load();
    return { data, me: identify(data) };
  }
  function emit(type, data = {}) {
    queueMicrotask(() => { for (const listener of listeners) listener({ type, data }); });
  }
  function changed(data, self = false) {
    save(data);
    emit('nearby.changed', { nearby_version: data.nearby_version });
    if (self) emit('self.changed');
  }
  // The demo stands in for the native scanner: while discovery is ON, seeded people
  // are treated as observed. Turning discovery OFF stops refreshing observations, so
  // they age out of the list exactly like a real proximity departure.
  function sweep(data, me) {
    if (!me.discovery_enabled) return;
    for (const person of Object.values(data.people)) {
      if (person.user_id === me.user_id || !person.discovery_enabled) continue;
      data.observations[person.user_id] = stamp((person.seed_age ?? 0) * 1000 % OBSERVATION_TTL);
    }
  }
  function nearby(data, me) {
    if (!me.discovery_enabled) return [];
    const cutoff = now() - OBSERVATION_TTL;
    return Object.values(data.people).filter((person) => {
      if (person.user_id === me.user_id || !person.discovery_enabled) return false;
      const observed = data.observations[person.user_id];
      return observed && Date.parse(observed) > cutoff;
    }).map((person) => ({ ...person, last_observed_at: data.observations[person.user_id] }))
      .sort((a, b) => b.last_observed_at.localeCompare(a.last_observed_at) || a.user_id.localeCompare(b.user_id));
  }

  // 데모용 규칙 추천기다. 모델 호출이 아니다 — 발표에서도 그렇게 말한다.
  //
  // 활용형을 정규식에 나열하지 않는다. `막힌`을 빠뜨려서 씨드 45명이 한 명도
  // 추천되지 않은 적이 있다. 어간까지만 적고 어미는 흘려보낸다.
  const ASKS = /막히|막힌|막혀|막혔|막막|모르|어렵|어려|헤매|궁금|찾|도움|필요|배우|알고 싶|보고 싶|익숙한 분|처음|감이 안|어떻게|보신 분|하실 분|계실까요|계신가요|있나요|있을까요|주실|봐주|물어보|여쭤|구해|구하/;
  const OFFERS = /해봤|해봐|해봅|구축|경험|자신|물어보셔도|물어봐 주|도와|알려|설명|봐드|드릴|드려|나누|공유|잡아봤|통과시켜|만들어봤|할 줄|잘 아|많이 했|많이 해|오래 했|좀 합니다|웬만한|가능해|가능합/;
  // 낱말이 정확히 겹치는 일은 드물다. 주제로 묶어야 추천이 사람 수만큼 나온다.
  const TOPICS = [
    ['배포와 인프라', ['도커', 'CI', '배포', 'AWS', '빌드', '파이프라인', '서버', '백엔드', '인증', 'OAuth', 'Firebase', '권한']],
    ['프론트엔드', ['React', '리액트', '프론트', '타입스크립트', '제네릭', '상태관리', '웹소켓', 'SSE', '소켓', '통신']],
    ['디자인', ['디자인', '피그마', '토큰', '일러스트', '아이콘', '프로토타입', '오토레이아웃']],
    ['기획과 제품', ['기획', 'PM', '기획서', '제품', '논문', 'NLP']],
    ['발표 준비', ['발표', '대본', '자료', '심사', '대회']],
    ['팀 구성', ['팀원', '팀 ', '팀이', '팀을']],
    ['첫 참가', ['처음', '비전공', '부트캠프', '편입', '1학년', '3학년', '구경', '익숙한', '분위기', '혼자', '아는 사람']],
    ['모바일', ['안드로이드', '앱 스토어', '스토어']],
    ['데이터', ['파이썬', '크롤링', '지도', 'API']],
    ['협업 도구', ['테스트', '깃', '충돌']],
  ];
  // `안 해봤어요`, `할 줄 아는 게 별로 없어요`는 `해봤`·`할 줄`을 품고 있다.
  // 부정을 걸러내지 않으면 못 한다고 쓴 사람을 근거로 추천하게 된다.
  const CANT = /안 해봤|못 해봤|해본 적 없|할 줄 아는 게 별로 없|아직 할 줄|한 번도|처음이라|별로 없|잘 몰라|모르겠/;
  const wrote = (person) => person.self_description + ' ' + person.connection_intent;
  const asks = (person) => ASKS.test(wrote(person));
  const offers = (person) => OFFERS.test(wrote(person)) && !CANT.test(wrote(person));
  function sharedTopic(viewer, candidate) {
    const mine = wrote(viewer), theirs = wrote(candidate);
    const hit = TOPICS.find(([, words]) => words.some((w) => mine.includes(w)) && words.some((w) => theirs.includes(w)));
    return hit ? hit[0] : null;
  }
  function reason(viewer, candidate) {
    // 상보성: 한쪽이 찾고 다른 쪽이 내어줄 때 성립한다. 방향은 양쪽 다 본다.
    const complementary = (asks(viewer) && offers(candidate)) || (offers(viewer) && asks(candidate));
    const topic = complementary ? sharedTopic(viewer, candidate) : null;
    return { state: topic ? 'ready' : 'unscored',
      // 근거는 상대가 실제로 쓴 원문에서 가져온다. 지어내지 않는다.
      reason: topic ? candidate.nickname + '님의 "' + candidate.self_description + '"가 지금 찾으시는 것과 맞아 보여요.' : null,
      viewer_profile_revision: viewer.profile_revision,
      candidate_profile_revision: candidate.profile_revision,
      policy_revision: 'demo-rules-1' };
  }
  function checkProfile(payload, editing = false) {
    const fields = validateProfile(payload, editing);
    if (Object.keys(fields).length) fail('INVALID_INPUT', '입력 내용을 확인해 주세요.', { fields });
  }
  const publicMe = (me) => ({
    user_id: me.user_id, nickname: me.nickname, self_description: me.self_description,
    connection_intent: me.connection_intent, profile_revision: me.profile_revision,
    discovery_enabled: me.discovery_enabled, discovery_revision: me.discovery_revision,
  });
  return {
    async registerInstall() {
      if (!read(installKey)) write(installKey, uuid());
      const data = load();
      return { user_id: data.installs[read(installKey)] ?? null };
    },
    async getMe() {
      const data = load();
      const me = identify(data, false);
      return me ? publicMe(me) : null;
    },
    async createProfile(payload) {
      const data = load();
      const install = read(installKey);
      if (!install) fail('INSTALL_REQUIRED', '설치 정보를 다시 확인해 주세요.');
      const existing = identify(data, false);
      if (existing) return publicMe(existing);
      checkProfile(payload);
      const me = { user_id: uuid(), nickname: payload.nickname.trim(),
        self_description: payload.self_description.trim(), connection_intent: payload.connection_intent.trim(),
        profile_revision: 1, discovery_enabled: true, discovery_revision: 1 };
      data.people[me.user_id] = me;
      data.installs[install] = me.user_id;
      data.nearby_version++;
      sweep(data, me);
      changed(data);
      return publicMe(me);
    },
    async updateProfile(payload) {
      const { data, me } = auth();
      if (payload.expected_profile_revision !== me.profile_revision) fail('REVISION_CONFLICT', '다른 화면에서 정보가 변경됐어요. 최신 정보를 확인한 뒤 다시 저장해 주세요.');
      checkProfile(payload, true);
      const self = payload.self_description.trim(), intent = payload.connection_intent.trim();
      if (self !== me.self_description || intent !== me.connection_intent) {
        Object.assign(me, { self_description: self, connection_intent: intent, profile_revision: me.profile_revision + 1 });
        data.nearby_version++;
        changed(data, true);
      }
      return publicMe(me);
    },
    async setDiscovery(payload) {
      const { data, me } = auth();
      if (payload.expected_discovery_revision !== undefined && payload.expected_discovery_revision !== me.discovery_revision) {
        fail('REVISION_CONFLICT', '발견 설정이 다른 곳에서 바뀌었어요. 다시 확인해 주세요.');
      }
      if (me.discovery_enabled !== Boolean(payload.enabled)) {
        me.discovery_enabled = Boolean(payload.enabled);
        me.discovery_revision++;
        data.nearby_version++;
        // Turning discovery off drops observations of me and stops new ones of others.
        if (!me.discovery_enabled) data.observations = {};
        else sweep(data, me);
        changed(data, true);
      }
      return publicMe(me);
    },
    async reportObservations(payload) {
      const { data, me } = auth();
      if (!me.discovery_enabled) fail('DISCOVERY_OFF', '발견 참여가 꺼져 있어요.');
      if (!Array.isArray(payload?.observations)) fail('INVALID_INPUT', '관측 보고 형식을 확인해 주세요.');
      sweep(data, me);
      save(data);
      return { nearby_version: data.nearby_version };
    },
    async getNearby() {
      const { data, me } = auth();
      sweep(data, me);
      save(data);
      return { nearby_version: data.nearby_version, recommendation_state: 'ready',
        items: nearby(data, me).map((person) => ({
          id: person.user_id, nickname: person.nickname, self_description: person.self_description,
          profile_revision: person.profile_revision, last_observed_at: person.last_observed_at,
          evaluation_state: reason(me, person).state,
        })) };
    },
    async getRecommendations() {
      const { data, me } = auth();
      return { nearby_version: data.nearby_version, state: 'ready',
        ordered_evaluated_ids: nearby(data, me).filter((person) => reason(me, person).state === 'ready').map((person) => person.user_id) };
    },
    async refreshRecommendations() {
      const { data } = auth();
      emit('recommendation.changed', { nearby_version: data.nearby_version, state: 'ready' });
      return { nearby_version: data.nearby_version, state: 'ready' };
    },
    async getPerson(id) {
      const { data, me } = auth();
      const person = nearby(data, me).find((candidate) => candidate.user_id === id);
      if (!person) fail('OBSERVATION_EXPIRED', '지금은 주변에 없는 사람이에요.');
      return {
        person: { id: person.user_id, nickname: person.nickname, self_description: person.self_description,
          connection_intent: person.connection_intent, profile_revision: person.profile_revision,
          last_observed_at: person.last_observed_at },
        recommendation: reason(me, person),
      };
    },
    async getConversations() {
      const { data, me } = auth();
      const visible = new Set(nearby(data, me).map((person) => person.user_id));
      return { items: Object.values(data.conversations).filter((c) => c.people.includes(me.user_id)).map((c) => {
        const peer = data.people[c.people.find((id) => id !== me.user_id)];
        return { id: c.id, peer: { id: peer.user_id, nickname: peer.nickname },
          peer_nearby: visible.has(peer.user_id), last_seq: c.messages.length, last_message: c.messages.at(-1) };
      }).sort((a, b) => b.last_message.created_at.localeCompare(a.last_message.created_at)) };
    },
    async sendMessage(payload) {
      const { data, me } = auth();
      const peer = data.people[payload.recipient_id];
      if (!peer || peer.user_id === me.user_id) fail('NOT_FOUND', '상대를 찾을 수 없어요.');
      const text = payload.text.trim();
      if (!text || lengthOf(text) > 2000 || !payload.client_message_id || payload.client_message_id.length > 64) fail('INVALID_INPUT', '메시지는 1~2,000자로 입력해 주세요.');
      const all = Object.values(data.conversations);
      const previous = all.flatMap((c) => c.messages).find((m) => m.sender_id === me.user_id && m.client_message_id === payload.client_message_id);
      if (previous) {
        const conversation = all.find((c) => c.id === previous.conversation_id);
        if (previous.text !== text || !conversation.people.includes(peer.user_id)) fail('IDEMPOTENCY_CONFLICT', '같은 전송 요청의 내용이 달라졌어요.');
        return { message: previous, replayed: true };
      }
      let conversation = all.find((c) => c.people.includes(me.user_id) && c.people.includes(peer.user_id));
      // A new relationship needs current proximity and both sides participating.
      // An existing conversation does not re-check either.
      if (!conversation) {
        if (!me.discovery_enabled) fail('DISCOVERY_OFF', '발견 참여를 켜야 새 대화를 시작할 수 있어요.');
        if (!nearby(data, me).some((candidate) => candidate.user_id === peer.user_id)) fail('OBSERVATION_EXPIRED', '지금은 주변에 없는 사람이에요.');
        conversation = { id: uuid(), people: [me.user_id, peer.user_id].sort(), messages: [] };
        data.conversations[conversation.id] = conversation;
      }
      const message = { id: uuid(), conversation_id: conversation.id, seq: conversation.messages.length + 1,
        sender_id: me.user_id, client_message_id: payload.client_message_id, text, created_at: stamp() };
      conversation.messages.push(message);
      save(data);
      emit('conversation.changed', { conversation_id: conversation.id, latest_seq: message.seq });
      return { message, replayed: false };
    },
    async getMessages(id, query = {}) {
      const { data, me } = auth();
      const conversation = data.conversations[id];
      if (!conversation?.people.includes(me.user_id)) fail('NOT_FOUND', '대화를 찾을 수 없어요.');
      const { after_seq, before_seq, limit = 50 } = query;
      if ((after_seq !== undefined && before_seq !== undefined) || limit < 1 || limit > 100) fail('INVALID_INPUT', '이력 조회 범위를 확인해 주세요.');
      const matching = conversation.messages.filter((m) => (after_seq === undefined || m.seq > after_seq) && (before_seq === undefined || m.seq < before_seq));
      const items = after_seq === undefined ? matching.slice(-limit) : matching.slice(0, limit);
      return { items, has_more: matching.length > items.length, next_after_seq: items.at(-1)?.seq ?? null,
        next_before_seq: items[0]?.seq ?? null, latest_seq: conversation.messages.length };
    },
    subscribe(callback, onError) {
      listeners.add(callback);
      let alive = true;
      const ready = () => {
        try {
          const data = load();
          callback({ type: 'ready', data: { nearby_version: data.nearby_version } });
        } catch { onError(); }
      };
      const onStorage = (event) => { if (event.key === STATE) ready(); };
      globalThis.addEventListener?.('storage', onStorage);
      queueMicrotask(() => { if (alive) ready(); });
      return () => { alive = false; listeners.delete(callback); globalThis.removeEventListener?.('storage', onStorage); };
    },
  };
}
