import { ConnectionBadge } from './components/ConnectionBadge';
import { useSocket } from './hooks/useSocket';
import { HomePage } from './pages/HomePage';
import { GamePage } from './pages/GamePage';
import { EnrollmentPage } from './pages/EnrollmentPage';
import { LobbyPage } from './pages/LobbyPage';
import { useRoomStore } from './stores/roomStore';

export default function App() {
  useSocket();
  const room = useRoomStore((state) => state.room);
  const enrollingPlayerId = useRoomStore((state) => state.enrollingPlayerId);

  return (
    <div className="app-frame">
      <ConnectionBadge />
      {room && enrollingPlayerId ? (
        <EnrollmentPage />
      ) : room ? (
        room.gameState.status === 'playing' ? (
          <GamePage />
        ) : (
          <LobbyPage />
        )
      ) : (
        <HomePage />
      )}
    </div>
  );
}
