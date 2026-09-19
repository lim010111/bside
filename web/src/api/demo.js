import { createMockApi } from './mock.js';
import { UNSUPPORTED } from '../lib/native.js';

// Adapts the demo server to the same surface as the HTTP client, so screens and the
// controller run one code path. The credential travels the same way it would over
// the wire — the demo server refuses calls without it.
export function createDemoClient({ credentials, storage, now } = {}) {
  const server = createMockApi({ ...(storage ? { storage } : {}), ...(now ? { now } : {}) });
  const as = async (fn) => {
    const credential = await credentials.get();
    return fn(credential);
  };
  return {
    server,
    registerInstallation: (payload) => server.registerInstallation(payload),
    getMe: () => as((c) => server.getMe(c)),
    putProfile: (payload) => as((c) => server.putProfile(c, payload)),
    setDiscovery: (payload) => as((c) => server.setDiscovery(c, payload)),
    issueIdentifier: () => as((c) => server.issueIdentifier(c)),
    reportObservations: (payload) => as((c) => server.reportObservations(c, payload)),
    getConversations: () => as((c) => server.getConversations(c)),
    sendMessage: (payload) => as((c) => server.sendMessage(c, payload)),
    getMessages: (id, query) => as((c) => server.getMessages(c, id, query)),
  };
}

// A stand-in for the Kotlin radio, for the browser demo only. It reports
// `simulated: true` so the screen can say plainly that this is not real BLE.
// It still drives the real data path: scan -> report -> observed_users.
export function createDemoBridge({ client, credentials }) {
  const listeners = { status: new Set(), observations: new Set() };
  const status = { ...UNSUPPORTED, supported: true, simulated: true, running: false, bluetooth: 'on', permission: 'granted', os: 'ok' };
  const emit = () => { for (const listener of listeners.status) listener({ ...status }); };
  return {
    supported: true,
    async getCredential() { return null; },
    async setCredential() {},
    async getStatus() { return { ...status }; },
    async start() { status.running = true; emit(); return { ...status }; },
    async stop() { status.running = false; emit(); return { ...status }; },
    async requestPermission() { return { ...status }; },
    async refreshObservations() {
      if (!status.running) return null;
      const credential = await credentials.get();
      if (!credential) return null;
      try {
        const identifiers = client.server._advertisedIdentifiers(credential);
        if (!identifiers.length) return { observed_users: [] };
        const result = await client.reportObservations({ identifiers: identifiers.slice(0, 50) });
        for (const listener of listeners.observations) listener(result);
        return result;
      } catch { return null; }
    },
    subscribeStatus(onStatus) { listeners.status.add(onStatus); return () => listeners.status.delete(onStatus); },
    subscribeObservations(onObservations) { listeners.observations.add(onObservations); return () => listeners.observations.delete(onObservations); },
  };
}
