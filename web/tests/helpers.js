import { setImmediate } from 'node:timers/promises';
import { createMockApi } from '../src/api/mock.js';

export function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
export const STATE_KEY = 'bside:demo:v3:state';
export const profile = (nickname = '테스터') => ({ nickname, self_description: 'React 프로젝트를 개발합니다', connection_intent: 'React 개발 도움을 찾고 있어요' });
export async function fixture({ seeded = true, clock } = {}) {
  const storage = memoryStorage();
  const api = createMockApi({ storage: () => storage, seeded, ...(clock ? { now: clock } : {}) });
  await api.registerInstall();
  const me = await api.createProfile(profile());
  return { api, storage, me };
}
// A native bridge that reports whatever the test wants, without a real radio.
export function fakeNative(status = {}) {
  const current = { supported: true, running: false, bluetooth: 'on', permission: 'granted', os: 'ok', detail: null, ...status };
  const listeners = new Set();
  const calls = [];
  return {
    supported: true, calls,
    async getStatus() { return { ...current }; },
    async start() { calls.push('start'); current.running = true; return { ...current }; },
    async stop() { calls.push('stop'); current.running = false; return { ...current }; },
    async requestPermission() { calls.push('requestPermission'); current.permission = 'granted'; return { ...current }; },
    subscribe(onStatus) { listeners.add(onStatus); return () => listeners.delete(onStatus); },
    push(next) { Object.assign(current, next); for (const listener of listeners) listener({ ...current }); },
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
