import type { DevicePresence, Room, RoomError } from '@roaming/shared';
import { create } from 'zustand';

interface RoomStore {
  room: Room | null;
  error: RoomError | null;
  pending: boolean;
  enrollingPlayerId: string | null;
  setRoom: (room: Room | null) => void;
  setError: (error: RoomError | null) => void;
  setPending: (pending: boolean) => void;
  setEnrollingPlayerId: (playerId: string | null) => void;
  setPresence: (presence: Record<string, DevicePresence>) => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
  room: null,
  error: null,
  pending: false,
  enrollingPlayerId: null,
  setRoom: (room) => set({ room, error: null, pending: false }),
  setError: (error) => set({ error, pending: false }),
  setPending: (pending) => set({ pending, error: null }),
  setEnrollingPlayerId: (enrollingPlayerId) => set({ enrollingPlayerId }),
  setPresence: (devicePresence) =>
    set((state) => ({
      room: state.room ? { ...state.room, devicePresence } : null,
    })),
}));
