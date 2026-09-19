// Bridge to the Capacitor/Kotlin discovery plugin (docs/android-design.md).
//
// The native side owns BLE advertising, scanning, background observation reporting
// and the recommendation notification. JS never runs a scan timer: it states the
// user's participation intent and reads back what is actually running.
//
// Kotlin implements this surface as the `Discovery` plugin. Until it exists the
// browser fallback reports `supported: false` so screens can say so honestly
// instead of showing a running state nobody verified.

/**
 * @typedef {'on'|'off'|'unavailable'|'unknown'} BluetoothState
 * @typedef {'granted'|'denied'|'prompt'|'unknown'} PermissionState
 * @typedef {'ok'|'restricted'|'unknown'} OsState
 * @typedef {{supported:boolean, running:boolean, bluetooth:BluetoothState,
 * permission:PermissionState, os:OsState, detail:string|null}} NativeStatus
 */

/** @type {NativeStatus} */
export const UNSUPPORTED = {
  supported: false, running: false, bluetooth: 'unavailable',
  permission: 'unknown', os: 'unknown', detail: null,
};

const plugin = () => globalThis.Capacitor?.Plugins?.Discovery ?? null;

function normalize(status) {
  return {
    supported: true,
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
    async getStatus() { return UNSUPPORTED; },
    async start() { return UNSUPPORTED; },
    async stop() { return UNSUPPORTED; },
    async requestPermission() { return UNSUPPORTED; },
    subscribe() { return () => {}; },
  };
  const call = async (name) => {
    try { return normalize(await target[name]()); }
    catch (error) { return { ...UNSUPPORTED, supported: true, detail: error?.message ?? null }; }
  };
  return {
    supported: true,
    getStatus: () => call('getStatus'),
    start: () => call('start'),
    stop: () => call('stop'),
    requestPermission: () => call('requestPermission'),
    subscribe(onStatus) {
      try {
        const handle = target.addListener?.('statusChanged', (status) => onStatus(normalize(status)));
        return () => { void handle?.then?.((h) => h.remove()); };
      } catch { return () => {}; }
    },
  };
}

// The user's own words for what is blocking discovery. Participation intent stays
// ON while this is shown: the setting and the actual radio state are separate.
export function nativeBlocker(status) {
  if (!status.supported) return { level: 'info', text: '이 화면에서는 주변 발견이 동작하지 않아요. Android 앱에서 확인해 주세요.' };
  if (status.permission === 'denied') return { level: 'blocked', text: '주변 기기 권한이 꺼져 있어요. 설정에서 허용하면 다시 발견을 시작해요.', action: 'permission' };
  if (status.permission === 'prompt') return { level: 'blocked', text: '주변 기기 권한이 필요해요.', action: 'permission' };
  if (status.bluetooth === 'off') return { level: 'blocked', text: 'Bluetooth가 꺼져 있어요. 켜면 주변 발견을 다시 시작해요.' };
  if (status.bluetooth === 'unavailable') return { level: 'blocked', text: '이 기기에서는 Bluetooth를 사용할 수 없어요.' };
  if (status.os === 'restricted') return { level: 'warn', text: '배터리 절약 설정 때문에 백그라운드 발견이 제한될 수 있어요.' };
  return null;
}
