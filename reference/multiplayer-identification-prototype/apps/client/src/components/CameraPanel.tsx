import { useState } from 'react';
import type { Player } from '@roaming/shared';
import { useCamera } from '../hooks/useCamera';
import { useFaceDetection } from '../hooks/useFaceDetection';
import { useFaceRecognition } from '../hooks/useFaceRecognition';
import { useConnectionStore } from '../stores/connectionStore';
import { useVisionStore } from '../stores/visionStore';

interface CameraPanelProps {
  players: Player[];
}

export function CameraPanel({ players }: CameraPanelProps) {
  const [showPreview, setShowPreview] = useState(false);
  const videoRef = useCamera(true);
  const hasEnrolledPlayers = players.some(
    (player) => player.enrolled && player.faceEmbedding,
  );
  useFaceDetection(videoRef, !hasEnrolledPlayers);
  useFaceRecognition(videoRef, players, hasEnrolledPlayers);
  const state = useVisionStore((vision) => vision.state);
  const error = useVisionStore((vision) => vision.error);
  const detectedFaces = useVisionStore((vision) => vision.detectedFaces);
  const detectionConfidence = useVisionStore(
    (vision) => vision.detectionConfidence,
  );
  const recognitionFps = useVisionStore((vision) => vision.recognitionFps);
  const matchThreshold = useVisionStore((vision) => vision.matchThreshold);
  const matchMargin = useVisionStore((vision) => vision.matchMargin);
  const setMatchThreshold = useVisionStore(
    (vision) => vision.setMatchThreshold,
  );
  const setMatchMargin = useVisionStore((vision) => vision.setMatchMargin);
  const recognizedPlayerId = useVisionStore(
    (vision) => vision.recognizedPlayerId,
  );
  const rawMatchedPlayerId = useVisionStore(
    (vision) => vision.rawMatchedPlayerId,
  );
  const rawMatchSimilarity = useVisionStore(
    (vision) => vision.rawMatchSimilarity,
  );
  const secondBestPlayerId = useVisionStore(
    (vision) => vision.secondBestPlayerId,
  );
  const secondBestSimilarity = useVisionStore(
    (vision) => vision.secondBestSimilarity,
  );
  const deviceId = useConnectionStore((connection) => connection.deviceId);
  const status = useConnectionStore((connection) => connection.status);
  const playerName = (playerId: string | null) =>
    players.find((player) => player.id === playerId)?.name ?? '—';

  return (
    <aside className={`camera-panel ${showPreview ? 'is-expanded' : ''}`}>
      <button
        className="camera-toggle"
        onClick={() => setShowPreview((visible) => !visible)}
        aria-expanded={showPreview}
      >
        <span className={`camera-status camera-status--${state}`} />
        {showPreview ? 'HIDE CAMERA DEBUG' : 'SHOW CAMERA DEBUG'}
      </button>
      <div className="camera-preview" aria-hidden={!showPreview}>
        <video ref={videoRef} muted playsInline />
        <div className="camera-meta">
          <dl>
            <div>
              <dt>State</dt>
              <dd>{state}</dd>
            </div>
            <div>
              <dt>Detected faces</dt>
              <dd>{detectedFaces}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{detectionConfidence?.toFixed(2) ?? '—'}</dd>
            </div>
            <div>
              <dt>Detection FPS</dt>
              <dd>{recognitionFps.toFixed(1)}</dd>
            </div>
            <div>
              <dt>Raw match</dt>
              <dd>
                {playerName(rawMatchedPlayerId)}{' '}
                {rawMatchSimilarity?.toFixed(3) ?? ''}
              </dd>
            </div>
            <div>
              <dt>Second best</dt>
              <dd>
                {playerName(secondBestPlayerId)}{' '}
                {secondBestSimilarity?.toFixed(3) ?? ''}
              </dd>
            </div>
            <div>
              <dt>Locked identity</dt>
              <dd>{playerName(recognizedPlayerId)}</dd>
            </div>
            <div>
              <dt>Connection</dt>
              <dd>{status}</dd>
            </div>
            <div>
              <dt>Device</dt>
              <dd title={deviceId}>{deviceId.slice(0, 8)}</dd>
            </div>
          </dl>
          <label className="debug-control">
            <span>Match threshold</span>
            <output>{matchThreshold.toFixed(2)}</output>
            <input
              type="range"
              min="0.3"
              max="0.9"
              step="0.01"
              value={matchThreshold}
              onChange={(event) =>
                setMatchThreshold(Number(event.target.value))
              }
            />
          </label>
          <label className="debug-control">
            <span>Match margin</span>
            <output>{matchMargin.toFixed(2)}</output>
            <input
              type="range"
              min="0"
              max="0.3"
              step="0.01"
              value={matchMargin}
              onChange={(event) => setMatchMargin(Number(event.target.value))}
            />
          </label>
        </div>
      </div>
      {state === 'ambiguous' ? (
        <p role="status">
          MULTIPLE PLAYERS DETECTED · Please stand one at a time.
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </aside>
  );
}
