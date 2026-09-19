import { setImmediate } from 'node:timers/promises';
import { createDemoClient, createDemoBridge } from '../src/api/demo.js';
import { createCredentialStore } from '../src/lib/credentials.js';

export function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
export const STATE_KEY = 'bside:demo:v4:state';
export const profile = (nickname = '테스터') => ({
  nickname, self_description: 'React 프로젝트를 개발합니다', connection_intent: 'React 개발 도움을 찾고 있어요',
});

// A registered installation with a stored profile and discovery on, plus the demo
// radio wired to it — the same path the app takes.
export async function fixture({ withProfile = true, clock } = {}) {
  const storage = memoryStorage();
  const credentials = createCredentialStore({ storage: () => storage });
  const api = createDemoClient({ credentials, storage: () => storage, ...(clock ? { now: clock } : {}) });
  const native = createDemoBridge({ client: api, credentials });
  const installation = await api.registerInstallation({
    installation_request_id: credentials.installRequestId(), platform: 'android',
  });
  await credentials.set(installation.installation_credential);
  if (withProfile) {
    await api.putProfile(profile());
    await api.setDiscovery({ enabled: true });
  }
  return { api, native, credentials, storage, userId: installation.user_id };
}
// Resolve a seeded person's identifier the way a real scan would, so tests can
// report observations without reaching into storage.
export async function scan(api, credentials) {
  const credential = await credentials.get();
  return api.server._advertisedIdentifiers(credential);
}
export function fakeNative(status = {}) {
  const current = {
    supported: true, simulated: false, running: false, bluetooth: 'on',
    permission: 'granted', os: 'ok', detail: null, ...status,
  };
  const listeners = { status: new Set(), observations: new Set() };
  const calls = [];
  let observations = { observed_users: [] };
  return {
    supported: true, calls,
    async getCredential() { return null; },
    async setCredential() {},
    async getStatus() { return { ...current }; },
    async start() { calls.push('start'); current.running = true; return { ...current }; },
    async stop() { calls.push('stop'); current.running = false; return { ...current }; },
    async requestPermission() { calls.push('requestPermission'); current.permission = 'granted'; return { ...current }; },
    async refreshObservations() { calls.push('refreshObservations'); return current.running ? observations : null; },
    subscribeStatus(onStatus) { listeners.status.add(onStatus); return () => listeners.status.delete(onStatus); },
    subscribeObservations(onObservations) { listeners.observations.add(onObservations); return () => listeners.observations.delete(onObservations); },
    setObservations(next) { observations = next; },
    pushObservations(next) { observations = next; for (const listener of listeners.observations) listener(next); },
    pushStatus(next) { Object.assign(current, next); for (const listener of listeners.status) listener({ ...current }); },
  };
}
export function observed(user_id, nickname, extra = {}) {
  return {
    user_id,
    profile: { nickname, self_description: nickname + '의 소개', connection_intent: nickname + '가 찾는 사람' },
    recommendation: { status: 'unavailable' },
    last_seen_at: new Date().toISOString(),
    conversation_eligibility_expires_at: new Date(Date.now() + 600000).toISOString(),
    ...extra,
  };
}
export async function until(predicate) {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (predicate()) return;
    await setImmediate();
  }
  throw new Error('Expected state did not arrive');
}
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
