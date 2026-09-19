import { createNativeBridge } from '../lib/native.js';
import { createCredentialStore } from '../lib/credentials.js';

// Development uses a labelled demo; production defaults to real HTTP requests.
export const isDemo = import.meta.env.VITE_USE_MOCK === '1'
  || ((import.meta.env.DEV || import.meta.env.MODE === 'demo') && import.meta.env.VITE_USE_MOCK !== '0');

const capacitor = createNativeBridge();
export const credentials = createCredentialStore({ native: capacitor });

let api, native;
if (isDemo) {
  const demo = await import('./demo.js');
  api = demo.createDemoClient({ credentials });
  native = demo.createDemoBridge({ client: api, credentials });
} else {
  const { createClient } = await import('./client.js');
  api = createClient({ base: import.meta.env.VITE_API_BASE ?? '', credentials });
  native = capacitor;
}
export { api, native };
