import type { PlayerColor } from '@roaming/shared';
import { useState, type FormEvent } from 'react';
import { addPlayer, leaveRoom, startGame } from '../networking/socket';
import { useConnectionStore } from '../stores/connectionStore';
import { useRoomStore } from '../stores/roomStore';

const colors: PlayerColor[] = ['red', 'blue', 'green', 'yellow'];

export function LobbyPage() {
  const [name, setName] = useState('');
  const [color, setColor] = useState<PlayerColor>('red');
  const room = useRoomStore((state) => state.room);
  const error = useRoomStore((state) => state.error);
  const pending = useRoomStore((state) => state.pending);
  const setEnrollingPlayerId = useRoomStore(
    (state) => state.setEnrollingPlayerId,
  );
  const deviceId = useConnectionStore((state) => state.deviceId);
  if (!room) return null;

  const takenColors = new Set(room.players.map((player) => player.color));
  const availableColors = colors.filter(
    (candidate) => !takenColors.has(candidate),
  );
  const selectedColor = availableColors.includes(color)
    ? color
    : availableColors[0];
  const isHost = room.hostDeviceId === deviceId;

  const handleAddPlayer = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedColor || !name.trim()) return;
    addPlayer(name, selectedColor);
    setName('');
  };

  return (
    <main className="shell lobby">
      <header className="lobby-header">
        <div>
          <p className="eyebrow">Waiting room</p>
          <h1>
            ROOM <span>{room.code}</span>
          </h1>
        </div>
        <button className="text-button" onClick={leaveRoom}>
          Leave
        </button>
      </header>

      <div className="lobby-grid">
        <section>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Players</p>
              <h2>{room.players.length} / 4 ready</h2>
            </div>
            <span>{room.connectedDeviceIds.length} laptops online</span>
          </div>
          <div className="player-list">
            {room.players.length === 0 ? (
              <p className="empty-state">Add the first player to this room.</p>
            ) : (
              room.players.map((player, index) => (
                <article key={player.id}>
                  <span
                    className={`color-swatch color-swatch--${player.color}`}
                  />
                  <div>
                    <h3>{player.name}</h3>
                    <p>
                      {player.color} ·{' '}
                      {player.enrolled ? '✓ Face ready' : 'Face not enrolled'}
                    </p>
                  </div>
                  {player.enrolled ? (
                    <span className="player-number">P{index + 1}</span>
                  ) : (
                    <button
                      className="enroll-button"
                      onClick={() => setEnrollingPlayerId(player.id)}
                    >
                      ENROLL FACE
                    </button>
                  )}
                </article>
              ))
            )}
          </div>
        </section>

        <aside className="setup-card">
          <p className="eyebrow">Add player</p>
          <form onSubmit={handleAddPlayer}>
            <label htmlFor="player-name">Player name</label>
            <input
              id="player-name"
              className="name-input"
              maxLength={24}
              placeholder="Jack"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <fieldset>
              <legend>Player color</legend>
              <div className="color-options">
                {colors.map((candidate) => (
                  <label
                    key={candidate}
                    className={`color-option color-option--${candidate} ${selectedColor === candidate ? 'is-selected' : ''} ${takenColors.has(candidate) ? 'is-taken' : ''}`}
                  >
                    <input
                      type="radio"
                      name="color"
                      value={candidate}
                      checked={selectedColor === candidate}
                      disabled={takenColors.has(candidate)}
                      onChange={() => setColor(candidate)}
                    />
                    <span>{candidate}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              className="secondary-button"
              disabled={pending || !name.trim() || !selectedColor}
              type="submit"
            >
              ADD PLAYER
            </button>
          </form>
          {error ? (
            <p className="error-message" role="alert">
              {error.message}
            </p>
          ) : null}
        </aside>
      </div>

      <div className="lobby-actions">
        <p>
          {isHost
            ? room.players.length < 2
              ? 'Add at least two players to start.'
              : room.players.every((player) => player.enrolled)
                ? 'Every player is enrolled. Ready to roam.'
                : 'You can start now; enroll everyone for face recognition.'
            : 'Waiting for the host to start.'}
        </p>
        {isHost ? (
          <button
            className="primary-button start-button"
            disabled={pending || room.players.length < 2}
            onClick={startGame}
          >
            START GAME
          </button>
        ) : null}
      </div>
    </main>
  );
}
