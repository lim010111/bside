// The installation credential is a bearer secret. On Android it belongs in the
// native app's protected storage and the WebView only borrows it per request.
//
// The browser fallback keeps it in localStorage, which is NOT protected storage.
// That is acceptable for the demo and for local development against a dev server;
// it is not the shipping path, and the screens say so through the native status.
export function createCredentialStore({ native, storage = () => globalThis.localStorage, prefix = 'bside:v1:' } = {}) {
  let cached = null;
  const read = (key) => {
    try { return storage()?.getItem(prefix + key) || null; } catch { return null; }
  };
  const write = (key, value) => {
    try { storage()?.setItem(prefix + key, value); } catch { /* private mode: memory only */ }
  };
  let requestId = null;
  return {
    async get() {
      if (cached) return cached;
      if (native?.supported) cached = await native.getCredential();
      cached ??= read('installation');
      return cached;
    },
    async set(value) {
      cached = value;
      if (native?.supported) await native.setCredential(value);
      else write('installation', value);
    },
    // The same registration key must survive retries, so a lost response replays the
    // original credential instead of creating a second installation.
    installRequestId() {
      requestId ??= read('install-request') || globalThis.crypto.randomUUID();
      write('install-request', requestId);
      return requestId;
    },
  };
}
