// Bridge to the Capacitor/Kotlin discovery plugin (docs/android-design.md).
//
// The native side owns three things the WebView cannot do:
//  1. the installation credential, in Android's protected storage;
//  2. BLE advertising, scanning and identifier rotation (POST /discovery/identifiers);
//  3. reporting scans (POST /discovery/observations) in the background, plus the
//     recommendation notification.
//
// JS never runs a scan timer and never sees a BLE identifier. It states the user's
// participation intent, reads back what is actually running, and receives the
// observation results — because API v0.1 has no GET /discovery/nearby, the nearby
// list only exists as the response to a report the native layer made.
//
// Kotlin implements this surface as the `Discovery` plugin (T01).

/**
 * @typedef {'on'|'off'|'unavailable'|'unknown'} BluetoothState
 * @typedef {'granted'|'denied'|'prompt'|'unknown'} PermissionState
 * @typedef {'ok'|'restricted'|'unknown'} OsState
 * @typedef {{supported:boolean, simulated:boolean, running:boolean, bluetooth:BluetoothState,
 * permission:PermissionState, os:OsState, detail:string|null}} NativeStatus
 */

/** @type {NativeStatus} */
export const UNSUPPORTED = {
  supported: false, simulated: false, running: false, bluetooth: 'unavailable',
  permission: 'unknown', os: 'unknown', detail: null,
};

const plugin = () => globalThis.Capacitor?.Plugins?.Discovery ?? null;

function normalize(status) {
  return {
    supported: true,
    simulated: Boolean(status?.simulated),
    running: Boolean(status?.running),
    bluetooth: status?.bluetooth ?? 'unknown',
    permission: status?.permission ?? 'unknown',
    os: status?.os ?? 'unknown',
    detail: status?.detail ?? null,
  };
}

export function createNativeBridge({ resolve = plugin } = {}) {
  const target = resolve();
  if (!target) return {
    supported: false,
    async getCredential() { return null; },
    async setCredential() {},
    async getStatus() { return UNSUPPORTED; },
    async start() { return UNSUPPORTED; },
    async stop() { return UNSUPPORTED; },
    async requestPermission() { return UNSUPPORTED; },
    async refreshObservations() { return null; },
    subscribeStatus() { return () => {}; },
    subscribeObservations() { return () => {}; },
  };
  const call = async (name) => {
    try { return normalize(await target[name]()); }
    catch (error) { return { ...UNSUPPORTED, supported: true, detail: error?.message ?? null }; }
  };
  const listen = (event, handler) => {
    try {
      const handle = target.addListener?.(event, handler);
      return () => { void handle?.then?.((h) => h.remove()); };
    } catch { return () => {}; }
  };
  return {
    supported: true,
    async getCredential() { return (await target.getCredential?.())?.installation_credential ?? null; },
    async setCredential(installation_credential) { await target.setCredential?.({ installation_credential }); },
    getStatus: () => call('getStatus'),
    start: () => call('start'),
    stop: () => call('stop'),
    requestPermission: () => call('requestPermission'),
    // Ask the native layer to scan and report now. It returns the server's
    // observation response, or null when it could not scan.
    async refreshObservations() {
      try { return (await target.refreshObservations?.()) ?? null; }
      catch { return null; }
    },
    subscribeStatus: (onStatus) => listen('statusChanged', (status) => onStatus(normalize(status))),
    subscribeObservations: (onObservations) => listen('observations', (payload) => onObservations(payload)),
  };
}

// The user's own words for what is blocking discovery. Participation intent stays ON
// while this is shown: the setting and the actual radio state are separate things.
export function nativeBlocker(status) {
  if (!status.supported) return { level: 'info', text: '이 화면에서는 주변 발견이 동작하지 않아요. Android 앱에서 확인해 주세요.' };
  if (status.simulated) return { level: 'info', text: '예시 데이터로 보여드리는 화면이에요. 실제 BLE 발견이 아니에요.' };
  if (status.permission === 'denied') return { level: 'blocked', text: '주변 기기 권한이 꺼져 있어요. 설정에서 허용하면 다시 발견을 시작해요.', action: 'permission' };
  if (status.permission === 'prompt') return { level: 'blocked', text: '주변 기기 권한이 필요해요.', action: 'permission' };
  if (status.bluetooth === 'off') return { level: 'blocked', text: 'Bluetooth가 꺼져 있어요. 켜면 주변 발견을 다시 시작해요.' };
  if (status.bluetooth === 'unavailable') return { level: 'blocked', text: '이 기기에서는 Bluetooth를 사용할 수 없어요.' };
  if (status.os === 'restricted') return { level: 'warn', text: '배터리 절약 설정 때문에 백그라운드 발견이 제한될 수 있어요.' };
  return null;
}
