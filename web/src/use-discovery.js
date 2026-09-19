import { createContext, useContext } from 'react';

export const DiscoveryContext = createContext(null);
export function useDiscovery() {
  const context = useContext(DiscoveryContext);
  if (!context) throw new Error('DiscoveryProvider가 필요합니다.');
  return context;
}
