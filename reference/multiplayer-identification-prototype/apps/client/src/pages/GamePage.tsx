import type { CSSProperties } from 'react';
import type { PlayerColor } from '@roaming/shared';
import { playActionSound } from '../audio/actionSound';
import { CameraPanel } from '../components/CameraPanel';
import { IDENTITY_DEBUG_MODE } from '../config/env';
import { usePresenceSync } from '../hooks/usePresenceSync';
import { leaveRoom, performDemoAction } from '../networking/socket';
import { useRoomStore } from '../stores/roomStore';
import { useVisionStore } from '../stores/visionStore';

const colorValues: Record<PlayerColor, string> = {
  red: '#ff5b5f',
  blue: '#5794ff',
  green: '#58d68d',
  yellow: '#ffd45a',
};

export function GamePage() {
  const room = useRoomStore((state) => state.room);
  const pending = useRoomStore((state) => state.pending);
  const recognizedPlayerId = useVisionStore(
    (state) => state.recognizedPlayerId,
  );
  const setDebugIdentity = useVisionStore((state) => state.setDebugIdentity);
  usePresenceSync(Boolean(room));
  if (!room) return null;

  const currentPlayer = room.players.find(
    (player) => player.id === room.gameState.currentTurnPlayerId,
  );
  const recognizedPlayer = room.players.find(
    (player) => player.id === recognizedPlayerId,
  );
  const isCurrentPlayer = recognizedPlayer?.id === currentPlayer?.id;
  const accent = recognizedPlayer
    ? colorValues[recognizedPlayer.color]
    : '#c9ff55';
  const showManualIdentity =
    IDENTITY_DEBUG_MODE || !room.players.some((player) => player.enrolled);

  return (
    <main
      className="game-screen"
      style={{ '--player-accent': accent } as CSSProperties}
    >
      <header>
        <span>ROOM {room.code}</span>
        <span>TURN {room.gameState.turnNumber}</span>
        <button className="game-leave-button" onClick={leaveRoom}>
          LEAVE ROOM
        </button>
      </header>
      <section className="game-focus">
        <p className="eyebrow">
          {recognizedPlayer
            ? 'Player locked'
            : showManualIdentity
              ? 'Manual identity mode'
              : 'Looking for a player'}
        </p>
        <h1>{recognizedPlayer?.name ?? currentPlayer?.name ?? 'WAITING'}</h1>
        <h2>
          {recognizedPlayer
            ? isCurrentPlayer
              ? 'YOUR TURN'
              : `WAITING FOR ${currentPlayer?.name.toUpperCase()}`
            : `CURRENT TURN · ${currentPlayer?.name.toUpperCase()}`}
        </h2>
        {isCurrentPlayer ? (
          <button
            className="act-button"
            disabled={pending}
            onClick={() => {
              playActionSound();
              performDemoAction();
            }}
          >
            ACT
          </button>
        ) : null}
      </section>

      {showManualIdentity ? (
        <section className="manual-identity">
          <div>
            <p className="eyebrow">Identity debug fallback</p>
            <h3>Who is standing here?</h3>
          </div>
          <div className="identity-buttons">
            <button
              className={!recognizedPlayerId ? 'is-active' : ''}
              onClick={() => setDebugIdentity(null)}
            >
              Nobody
            </button>
            {room.players.map((player) => (
              <button
                key={player.id}
                className={recognizedPlayerId === player.id ? 'is-active' : ''}
                onClick={() => setDebugIdentity(player.id)}
              >
                <span style={{ background: colorValues[player.color] }} />
                {player.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="score-strip">
        {room.players.map((player) => (
          <div key={player.id}>
            <span>{player.name}</span>
            <strong>{room.gameState.demoScore[player.id] ?? 0}</strong>
          </div>
        ))}
      </section>
      <CameraPanel players={room.players} />
    </main>
  );
}
