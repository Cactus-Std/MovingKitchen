import { useEffect } from 'react';
import { initializeSocket } from '../networking/socket';

export function useSocket(): void {
  useEffect(() => initializeSocket(), []);
}
