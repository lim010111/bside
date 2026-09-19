import { createContext, useContext } from 'react';

export const RoomContext = createContext(null);
export function useRoom() {
  const context = useContext(RoomContext);
  if (!context) throw new Error('RoomProvider가 필요합니다.');
  return context;
}
