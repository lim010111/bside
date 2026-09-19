import { setImmediate } from 'node:timers/promises';
import { createMockApi } from '../src/api/mock.js';

export function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
export const profile = (nickname = '테스터') => ({ nickname, self_description: 'React 프로젝트를 개발합니다', connection_intent: 'React 개발 도움을 찾고 있어요' });
export async function fixture({ seeded = true } = {}) {
  const storage = memoryStorage();
  const api = createMockApi({ storage: () => storage, seeded });
  await api.ensureSession();
  const me = await api.join('KOSS26', profile());
  return { api, storage, me };
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
