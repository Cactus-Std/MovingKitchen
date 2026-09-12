import { useState, type FormEvent } from 'react';
import { createRoom, joinRoom } from '../networking/socket';
import { useConnectionStore } from '../stores/connectionStore';
import { useRoomStore } from '../stores/roomStore';

export function HomePage() {
  const [roomCode, setRoomCode] = useState('');
  const status = useConnectionStore((state) => state.status);
  const { error, pending } = useRoomStore();
  const unavailable = status !== 'connected' || pending;

  const handleJoin = (event: FormEvent) => {
    event.preventDefault();
    if (roomCode.length === 4) joinRoom(roomCode);
  };

  return (
    <main className="shell home">
      <section className="hero">
        <p className="eyebrow">Local multiplayer · roaming identity</p>
        <h1>Your identity follows you.</h1>
        <p className="lede">
          Create one room, join from every laptop, then move between screens
          without losing your place in the game.
        </p>
      </section>

      <section className="room-card" aria-label="Room controls">
        <button
          className="primary-button"
          disabled={unavailable}
          onClick={createRoom}
        >
          {pending ? 'WORKING…' : 'CREATE ROOM'}
        </button>
        <div className="divider">
          <span>or join a room</span>
        </div>
        <form onSubmit={handleJoin}>
          <label htmlFor="room-code">Room code</label>
          <input
            id="room-code"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={4}
            placeholder="AB12"
            value={roomCode}
            onChange={(event) =>
              setRoomCode(
                event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
              )
            }
          />
          <button
            className="secondary-button"
            disabled={unavailable || roomCode.length !== 4}
            type="submit"
          >
            JOIN ROOM
          </button>
        </form>
        {error && (
          <p className="error-message" role="alert">
            {error.message}
          </p>
        )}
      </section>
    </main>
  );
}
