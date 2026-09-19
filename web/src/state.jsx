import { useEffect, useReducer, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { api, native, credentials } from './api/index.js';
import { createDiscoveryController } from './discovery-controller.js';
import { DiscoveryContext } from './use-discovery.js';
import { createNavigation } from './lib/navigation.js';

export function DiscoveryProvider({ children }) {
  const [navigation] = useState(() => createNavigation(window));
  const [controller] = useState(() => createDiscoveryController({
    api, native, credentials,
    route: navigation.read,
    writeRoute: navigation.write,
  }));
  const [state, dispatch] = useReducer((_, next) => next, controller.getState());

  useEffect(() => {
    navigation.initialize();
    const unsubscribe = controller.subscribe(dispatch);
    void controller.start();
    const onHistory = () => {
      const target = navigation.read();
      controller.navigate(target.view, target.id, false);
    };
    const onReturn = () => {
      if (document.visibilityState === 'visible') controller.resumeConnection();
    };
    const onOffline = () => controller.refreshAll();
    const backListener = Capacitor.getPlatform() === 'android'
      ? App.addListener('backButton', () => {
        if (!navigation.back(controller.navigate)) void App.minimizeApp();
      }) : null;
    window.addEventListener('popstate', onHistory);
    window.addEventListener('hashchange', onHistory);
    window.addEventListener('online', onReturn);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      unsubscribe(); controller.dispose();
      void backListener?.then((listener) => listener.remove());
      window.removeEventListener('popstate', onHistory);
      window.removeEventListener('hashchange', onHistory);
      window.removeEventListener('online', onReturn);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [controller, navigation]);

  return <DiscoveryContext.Provider value={{ state, actions: { ...controller, goBack: () => navigation.back(controller.navigate) } }}>{children}</DiscoveryContext.Provider>;
}
