// Development uses a labelled demo; production defaults to real HTTP requests.
export const isDemo = import.meta.env.VITE_USE_MOCK === '1'
  || ((import.meta.env.DEV || import.meta.env.MODE === 'demo') && import.meta.env.VITE_USE_MOCK !== '0');
export const api = isDemo
  ? (await import('./mock.js')).createMockApi()
  : (await import('./client.js')).createClient({ base: import.meta.env.VITE_API_BASE ?? '' });
