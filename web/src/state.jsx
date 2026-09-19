import { useEffect, useReducer, useState } from 'react';
import { api, native, credentials } from './api/index.js';
import { createDiscoveryController } from './discovery-controller.js';
import { DiscoveryContext } from './use-discovery.js';

export function DiscoveryProvider({ children }) {
  const [controller] = useState(() => createDiscoveryController({
    api, native, credentials,
    route: readRoute,
    writeRoute: ({ view, id }) => {
      const hash = '#' + view + (id ? '/' + encodeURIComponent(id) : '');
      if (window.location.hash !== hash) window.history.pushState(null, '', hash);
    },
  }));
  const [state, dispatch] = useReducer((_, next) => next, controller.getState());

  useEffect(() => {
    const unsubscribe = controller.subscribe(dispatch);
    void controller.start();
    const onHistory = () => {
      const target = readRoute();
      controller.navigate(target.view, target.id, false);
    };
    const onReturn = () => {
      if (document.visibilityState === 'visible') controller.resumeConnection();
    };
    const onOffline = () => controller.refreshAll();
    window.addEventListener('popstate', onHistory);
    window.addEventListener('hashchange', onHistory);
    window.addEventListener('online', onReturn);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      unsubscribe(); controller.dispose();
      window.removeEventListener('popstate', onHistory);
      window.removeEventListener('hashchange', onHistory);
      window.removeEventListener('online', onReturn);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [controller]);

  return <DiscoveryContext.Provider value={{ state, actions: controller }}>{children}</DiscoveryContext.Provider>;
}

function readRoute() {
  const [view, rawId] = window.location.hash.slice(1).split('/');
  let id;
  try { id = rawId ? decodeURIComponent(rawId) : undefined; } catch { id = undefined; }
  return { view: view || 'nearby', id };
}
