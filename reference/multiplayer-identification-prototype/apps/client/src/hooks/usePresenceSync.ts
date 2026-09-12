import { useEffect } from 'react';
import { updatePresence } from '../networking/socket';
import { useVisionStore } from '../stores/visionStore';

const PRESENCE_HEARTBEAT_MS = 1_000;

export function usePresenceSync(enabled: boolean): void {
  const playerId = useVisionStore((state) => state.recognizedPlayerId);

  useEffect(() => {
    if (!enabled) return;
    const sendPresence = () =>
      updatePresence(playerId, useVisionStore.getState().confidence);
    sendPresence();
    if (!playerId) return;
    const intervalId = window.setInterval(sendPresence, PRESENCE_HEARTBEAT_MS);
    return () => window.clearInterval(intervalId);
  }, [enabled, playerId]);
}
