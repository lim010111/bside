import { createNativeBridge } from '../lib/native.js';
import { createCredentialStore } from '../lib/credentials.js';

// Development uses a labelled demo; production defaults to real HTTP requests.
export const isDemo = import.meta.env.VITE_USE_MOCK === '1'
  || ((import.meta.env.DEV || import.meta.env.MODE === 'demo') && import.meta.env.VITE_USE_MOCK !== '0');

// Development only: drive the real server from a browser, with two tabs standing in
// for two phones. Never enabled in a production build.
const devRadio = import.meta.env.DEV && import.meta.env.VITE_DEV_RADIO === '1' && !isDemo;
// Each tab needs its own installation, so ?device= picks the credential slot.
const slot = devRadio ? (new URLSearchParams(globalThis.location?.search).get('device') || 'a') : null;

const capacitor = createNativeBridge();
export const credentials = createCredentialStore({
  native: capacitor,
  ...(slot ? { prefix: `bside:dev:${slot}:` } : {}),
});

let api, native;
if (isDemo) {
  const demo = await import('./demo.js');
  api = demo.createDemoClient({ credentials });
  native = demo.createDemoBridge({ client: api, credentials });
} else {
  const { createClient } = await import('./client.js');
  api = createClient({ base: import.meta.env.VITE_API_BASE ?? '', credentials });
  if (devRadio) {
    const { createDevRadio } = await import('./dev-radio.js');
    native = createDevRadio({ client: api });
  } else {
    native = capacitor;
  }
}
export { api, native };
