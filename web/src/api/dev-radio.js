import { UNSUPPORTED } from '../lib/native.js';

// A development stand-in for the Kotlin radio, used to exercise the REAL server from
// a browser. It is not BLE and never ships: `api/index.js` only builds it when
// VITE_DEV_RADIO=1, and it reports `simulated: true` so the screen says so.
//
// It follows the same shape the plugin must implement:
//   start()  -> POST /discovery/identifiers, then advertise that identifier
//   scan     -> collect identifiers other instances advertised
//   report   -> POST /discovery/observations and hand the response to JS
//
// Two browser tabs stand in for two phones. `?device=a` and `?device=b` give each tab
// its own installation credential; the shared localStorage key below is the "air"
// they advertise into.
const AIR = 'bside:dev:radio';
const ADVERTISE_TTL = 300000;   // matches the contract's five-minute identifier life
const SCAN_INTERVAL = 4000;

function readAir(storage) {
  try { return JSON.parse(storage()?.getItem(AIR) || '{}'); } catch { return {}; }
}
function writeAir(storage, value) {
  try { storage()?.setItem(AIR, JSON.stringify(value)); } catch { /* private mode */ }
}

export function createDevRadio({ client, storage = () => globalThis.localStorage }) {
  const listeners = { status: new Set(), observations: new Set() };
  const status = {
    ...UNSUPPORTED, supported: true, simulated: true, running: false,
    bluetooth: 'on', permission: 'granted', os: 'ok',
    detail: '개발용 가상 라디오입니다. 실제 BLE가 아닙니다.',
  };
  let mine = null, timer = null;
  const emitStatus = () => { for (const listener of listeners.status) listener({ ...status }); };

  async function advertise() {
    const issued = await client.issueIdentifier();
    mine = issued.identifier;
    const air = readAir(storage);
    air[mine] = Date.now();
    // Drop identifiers whose life has run out, the way a real one stops being heard.
    for (const [identifier, at] of Object.entries(air)) {
      if (Date.now() - at > ADVERTISE_TTL) delete air[identifier];
    }
    writeAir(storage, air);
  }

  async function sweep() {
    if (!status.running) return null;
    try {
      await advertise();
      const heard = Object.keys(readAir(storage)).filter((identifier) => identifier !== mine);
      if (!heard.length) return { observed_users: [] };
      const result = await client.reportObservations({ identifiers: heard.slice(0, 50) });
      for (const listener of listeners.observations) listener(result);
      return result;
    } catch (error) {
      status.detail = error?.message ?? null;
      emitStatus();
      return null;
    }
  }

  return {
    supported: true,
    async getCredential() { return null; },
    async setCredential() {},
    async getStatus() { return { ...status }; },
    async start() {
      status.running = true;
      emitStatus();
      clearInterval(timer);
      timer = setInterval(() => { void sweep(); }, SCAN_INTERVAL);
      await sweep();
      return { ...status };
    },
    async stop() {
      status.running = false;
      clearInterval(timer); timer = null;
      if (mine) {
        const air = readAir(storage);
        delete air[mine];
        writeAir(storage, air);
        mine = null;
      }
      emitStatus();
      return { ...status };
    },
    async requestPermission() { return { ...status }; },
    refreshObservations: sweep,
    subscribeStatus(onStatus) { listeners.status.add(onStatus); return () => listeners.status.delete(onStatus); },
    subscribeObservations(onObservations) { listeners.observations.add(onObservations); return () => listeners.observations.delete(onObservations); },
  };
}
