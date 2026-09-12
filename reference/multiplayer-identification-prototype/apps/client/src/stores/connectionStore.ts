import { create } from 'zustand';
import { getDeviceId } from '../networking/deviceId';

const ROOM_CODE_KEY = 'roaming-player:room-code';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface ConnectionStore {
  status: ConnectionStatus;
  deviceId: string;
  roomCode: string | null;
  setStatus: (status: ConnectionStatus) => void;
  setRoomCode: (roomCode: string | null) => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: 'connecting',
  deviceId: getDeviceId(),
  roomCode: sessionStorage.getItem(ROOM_CODE_KEY),
  setStatus: (status) => set({ status }),
  setRoomCode: (roomCode) => {
    if (roomCode) sessionStorage.setItem(ROOM_CODE_KEY, roomCode);
    else sessionStorage.removeItem(ROOM_CODE_KEY);
    set({ roomCode });
  },
}));
