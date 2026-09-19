import { SEED_NEARBY } from './seeds.js';
import { ApiError, lengthOf, validateProfile } from '../lib/contracts.js';

// Browser-only demo of the SERVER described by docs/api-contract.md v0.1. It has no
// BLE: it stands in for what the server would know after the native layer reported
// observations. Seeded people never reply — there is no second device here.
//
// Isolated v4 keys leave earlier prototype data untouched.
export const IDENTIFIER_TTL = 300000;      // 5 minutes, per the contract
export const ELIGIBILITY_WINDOW = 600000;  // 10 minutes, per the contract

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function createMockApi({ storage = () => globalThis.localStorage, seeded = true, now = Date.now } = {}) {
  const STATE = 'bside:demo:v4:state';
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
  // A 22-char unpadded base64url token, like the contract's 128-bit identifier.
  function token() {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function load() {
    let data = read(STATE);
    if (!data) {
      const users = {};
      if (seeded) for (const person of SEED_NEARBY) {
        users[person.id] = {
          user_id: person.id,
          profile: { nickname: person.name, self_description: person.self, connection_intent: person.intent },
          discovery_enabled: true, seed_age: person.age,
        };
      }
      data = { users, credentials: {}, installRequests: {}, identifiers: {}, observations: {}, conversations: {} };
      write(STATE, data);
    }
    return data;
  }
  const save = (data) => write(STATE, data);
  function auth(data, credential) {
    const user = data.users[data.credentials[credential]] ?? null;
    if (!user) fail('UNAUTHORIZED', '설치 정보를 다시 확인해 주세요.', { status: 401 });
    return user;
  }
  const publicProfile = (user) => user.profile && { ...user.profile };
  const requireProfile = (user) => { if (!user.profile) fail('PROFILE_REQUIRED', '먼저 내 소개를 입력해 주세요.', { status: 409 }); };

  // Identifiers rotate on the server's clock, exactly like the contract describes.
  function identifierFor(data, user) {
    const current = data.identifiers[user.user_id];
    if (current && now() < Date.parse(current.refresh_after)) return current;
    const issued = now();
    const next = {
      identifier: token(),
      issued_at: new Date(issued).toISOString(),
      refresh_after: new Date(issued + IDENTIFIER_TTL - 60000).toISOString(),
      expires_at: new Date(issued + IDENTIFIER_TTL).toISOString(),
      previous: current ? { identifier: current.identifier, expires_at: current.expires_at } : null,
    };
    data.identifiers[user.user_id] = next;
    return next;
  }
  function resolveIdentifier(data, value) {
    for (const [userId, record] of Object.entries(data.identifiers)) {
      if (record.identifier === value && now() < Date.parse(record.expires_at)) return userId;
      // A replaced identifier stays valid until its own original expiry.
      if (record.previous?.identifier === value && now() < Date.parse(record.previous.expires_at)) return userId;
    }
    return null;
  }
  // The demo stands in for the radio too: seeded people advertise while they have
  // discovery on, so a scan has something to resolve.
  function seedIdentifiers(data, me) {
    for (const user of Object.values(data.users)) {
      if (user.user_id === me.user_id || !user.discovery_enabled || !user.profile) continue;
      identifierFor(data, user);
    }
  }
  function observedUser(data, viewerId, userId) {
    const user = data.users[userId];
    const seen = data.observations[viewerId]?.[userId];
    if (!user || !seen) return null;
    return {
      user_id: user.user_id,
      profile: { ...user.profile },
      // v0.1 always reports 'unavailable'. AI evaluation is a follow-up task.
      recommendation: { status: 'unavailable' },
      last_seen_at: seen.last_seen_at,
      conversation_eligibility_expires_at: seen.eligible_until,
    };
  }
  function checkProfile(payload) {
    if (!payload || typeof payload !== 'object') fail('VALIDATION_ERROR', '입력 내용을 확인해 주세요.', { status: 422 });
    const fields = validateProfile(payload);
    const field = Object.keys(fields)[0];
    if (field) fail('VALIDATION_ERROR', fields[field], { status: 422, fields: { [field]: fields[field] } });
  }

  return {
    async registerInstallation(payload) {
      if (!UUID_V4.test(payload?.installation_request_id ?? '') || payload?.platform !== 'android') {
        fail('VALIDATION_ERROR', '설치 등록 요청을 확인해 주세요.', { status: 422 });
      }
      const data = load();
      const previous = data.installRequests[payload.installation_request_id];
      if (previous) {
        if (previous.platform !== payload.platform) fail('IDEMPOTENCY_CONFLICT', '같은 등록 요청의 내용이 달라졌어요.', { status: 409 });
        if (now() - previous.at > 600000) fail('IDEMPOTENCY_REPLAY_EXPIRED', '등록 요청이 만료됐어요. 앱을 다시 시작해 주세요.', { status: 409 });
        return { user_id: previous.user_id, installation_credential: previous.installation_credential, created_at: previous.created_at };
      }
      const user = { user_id: uuid(), profile: null, discovery_enabled: false };
      const credential = 'ic_' + token() + token();
      data.users[user.user_id] = user;
      data.credentials[credential] = user.user_id;
      data.installRequests[payload.installation_request_id] = {
        user_id: user.user_id, installation_credential: credential, platform: payload.platform,
        created_at: stamp(), at: now(),
      };
      save(data);
      return { user_id: user.user_id, installation_credential: credential, created_at: stamp() };
    },
    async getMe(credential) {
      const data = load();
      const me = auth(data, credential);
      return { user_id: me.user_id, profile: publicProfile(me), discovery_enabled: me.discovery_enabled };
    },
    async putProfile(credential, payload) {
      const data = load();
      const me = auth(data, credential);
      checkProfile(payload);
      me.profile = {
        nickname: payload.nickname.trim(),
        self_description: payload.self_description.trim(),
        connection_intent: payload.connection_intent.trim(),
      };
      save(data);
      return { ...me.profile };
    },
    async setDiscovery(credential, payload) {
      const data = load();
      const me = auth(data, credential);
      if (typeof payload?.enabled !== 'boolean') fail('VALIDATION_ERROR', '발견 설정 값을 확인해 주세요.', { status: 422 });
      me.discovery_enabled = payload.enabled;
      if (!me.discovery_enabled) {
        // Turning discovery off stops advertising and drops what I observed. It does
        // not touch conversations.
        delete data.identifiers[me.user_id];
        delete data.observations[me.user_id];
      }
      save(data);
      return { discovery_enabled: me.discovery_enabled };
    },
    async issueIdentifier(credential) {
      const data = load();
      const me = auth(data, credential);
      requireProfile(me);
      if (!me.discovery_enabled) fail('DISCOVERY_DISABLED', '주변 발견이 꺼져 있어요.', { status: 409 });
      const record = identifierFor(data, me);
      save(data);
      const { previous: _rotated, ...response } = record;
      return response;
    },
    async reportObservations(credential, payload) {
      const data = load();
      const me = auth(data, credential);
      requireProfile(me);
      const identifiers = payload?.identifiers;
      if (!Array.isArray(identifiers) || identifiers.length < 1 || identifiers.length > 50) {
        fail('VALIDATION_ERROR', '관측 보고 형식을 확인해 주세요.', { status: 422 });
      }
      // Discovery OFF means I neither advertise nor collect: no valid observations.
      if (!me.discovery_enabled) return { observed_users: [] };
      const mine = (data.observations[me.user_id] ??= {});
      const resolved = new Set();
      for (const value of identifiers) {
        const userId = resolveIdentifier(data, value);
        const other = userId && data.users[userId];
        // Invalid, expired, self and non-participating identifiers are ignored,
        // never a batch failure.
        if (!other || other.user_id === me.user_id || !other.discovery_enabled || !other.profile) continue;
        mine[other.user_id] = { last_seen_at: stamp(), eligible_until: new Date(now() + ELIGIBILITY_WINDOW).toISOString() };
        resolved.add(other.user_id);
      }
      save(data);
      return { observed_users: [...resolved].map((id) => observedUser(data, me.user_id, id)).filter(Boolean) };
    },
    async getConversations(credential) {
      const data = load();
      const me = auth(data, credential);
      return { conversations: Object.values(data.conversations)
        .filter((c) => c.people.includes(me.user_id) && c.messages.length)
        .map((c) => {
          const peer = data.users[c.people.find((id) => id !== me.user_id)];
          return {
            conversation_id: c.id,
            participant: { user_id: peer.user_id, profile: { ...peer.profile } },
            last_message: c.messages.at(-1),
          };
        })
        .sort((a, b) => b.last_message.created_at.localeCompare(a.last_message.created_at)) };
    },
    async sendMessage(credential, payload) {
      const data = load();
      const me = auth(data, credential);
      const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
      if (!UUID_V4.test(payload?.client_message_id ?? '') || !text || lengthOf(text) > 2000) {
        fail('VALIDATION_ERROR', '메시지는 1~2,000자로 입력해 주세요.', { status: 422 });
      }
      if (payload.recipient_id === me.user_id) fail('VALIDATION_ERROR', '자신에게는 보낼 수 없어요.', { status: 422 });
      const all = Object.values(data.conversations);
      const previous = all.flatMap((c) => c.messages).find((m) => m.sender_id === me.user_id && m.client_message_id === payload.client_message_id);
      if (previous) {
        if (previous.text !== text || previous.recipient_id !== payload.recipient_id) fail('IDEMPOTENCY_CONFLICT', '같은 전송 요청의 내용이 달라졌어요.', { status: 409 });
        return strip(previous);
      }
      const peer = data.users[payload.recipient_id];
      if (!peer) fail('RECIPIENT_NOT_FOUND', '상대를 찾을 수 없어요.', { status: 404 });
      let conversation = all.find((c) => c.people.includes(me.user_id) && c.people.includes(peer.user_id));
      // A new relationship is re-checked at save time. An existing conversation is not.
      if (!conversation) {
        requireProfile(me);
        if (!peer.profile) fail('PROFILE_REQUIRED', '상대가 아직 소개를 작성하지 않았어요.', { status: 409 });
        if (!me.discovery_enabled || !peer.discovery_enabled) fail('DISCOVERY_DISABLED', '주변 발견이 꺼져 있어요.', { status: 403 });
        const seen = data.observations[me.user_id]?.[peer.user_id];
        if (!seen || now() >= Date.parse(seen.eligible_until)) fail('OBSERVATION_REQUIRED', '지금은 주변에 없는 사람이에요.', { status: 403 });
        conversation = { id: uuid(), people: [me.user_id, peer.user_id].sort(), messages: [] };
        data.conversations[conversation.id] = conversation;
      }
      const message = {
        message_id: uuid(), conversation_id: conversation.id, sender_id: me.user_id,
        recipient_id: peer.user_id, seq: conversation.messages.length + 1,
        text, created_at: stamp(), client_message_id: payload.client_message_id,
      };
      conversation.messages.push(message);
      save(data);
      return strip(message);
    },
    async getMessages(credential, id, query = {}) {
      const data = load();
      const me = auth(data, credential);
      const conversation = data.conversations[id];
      if (!conversation?.people.includes(me.user_id)) fail('CONVERSATION_NOT_FOUND', '대화를 찾을 수 없어요.', { status: 404 });
      const after = Number(query.after_seq ?? 0), limit = Number(query.limit ?? 50);
      if (!Number.isInteger(after) || after < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        fail('VALIDATION_ERROR', '이력 조회 범위를 확인해 주세요.', { status: 422 });
      }
      const matching = conversation.messages.filter((m) => m.seq > after);
      const messages = matching.slice(0, limit).map(strip);
      const has_more = matching.length > messages.length;
      return { messages, next_after_seq: has_more ? messages.at(-1).seq : null, has_more };
    },
    // Demo-only: lets the demo radio learn which identifiers are in the air.
    _advertisedIdentifiers(credential) {
      const data = load();
      const me = auth(data, credential);
      seedIdentifiers(data, me);
      save(data);
      return Object.entries(data.identifiers)
        .filter(([userId]) => userId !== me.user_id)
        .map(([, record]) => record.identifier);
    },
    // Demo-only: the one thing a single browser cannot produce is a reply from the
    // other device. Tests use this to land a peer message the client has not seen.
    _injectPeerMessage(conversationId, senderId, text = '상대가 보낸 메시지') {
      const data = load();
      const conversation = data.conversations[conversationId];
      if (!conversation?.people.includes(senderId)) throw new ApiError('CONVERSATION_NOT_FOUND', '대화를 찾을 수 없어요.', { status: 404 });
      const message = {
        message_id: uuid(), conversation_id: conversationId, sender_id: senderId,
        recipient_id: conversation.people.find((id) => id !== senderId),
        seq: conversation.messages.length + 1, text, created_at: stamp(),
        client_message_id: uuid(),
      };
      conversation.messages.push(message);
      save(data);
      return strip(message);
    },
  };
}

// client_message_id is the client's dedupe key, not part of the public Message shape.
function strip(message) {
  const { client_message_id: _dedupeKey, ...rest } = message;
  return rest;
}
