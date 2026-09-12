import { useEffect, useRef, useState } from 'react';
import { useCamera } from '../hooks/useCamera';
import { enrollPlayer } from '../networking/socket';
import { useRoomStore } from '../stores/roomStore';
import { useVisionStore } from '../stores/visionStore';
import { MediaPipeOnnxFaceRecognitionProvider } from '../vision/MediaPipeOnnxFaceRecognitionProvider';

export function EnrollmentPage() {
  const [progress, setProgress] = useState(0);
  const [working, setWorking] = useState(false);
  const providerRef = useRef<MediaPipeOnnxFaceRecognitionProvider | null>(null);
  const videoRef = useCamera(true);
  const room = useRoomStore((state) => state.room);
  const playerId = useRoomStore((state) => state.enrollingPlayerId);
  const setEnrollingPlayerId = useRoomStore(
    (state) => state.setEnrollingPlayerId,
  );
  const visionState = useVisionStore((state) => state.state);
  const visionError = useVisionStore((state) => state.error);
  const setCameraState = useVisionStore((state) => state.setCameraState);
  const player = room?.players.find((candidate) => candidate.id === playerId);

  useEffect(
    () => () => {
      providerRef.current?.dispose();
    },
    [],
  );

  useEffect(() => {
    if (player?.enrolled) setEnrollingPlayerId(null);
  }, [player?.enrolled, setEnrollingPlayerId]);

  if (!room || !player) return null;

  const beginEnrollment = async () => {
    setWorking(true);
    setProgress(0);
    setCameraState('loading', null);
    const provider = new MediaPipeOnnxFaceRecognitionProvider();
    providerRef.current = provider;
    try {
      await provider.initialize();
      setCameraState('enrolling', null);
      const embedding = await provider.enroll(videoRef.current!, setProgress);
      enrollPlayer(player.id, embedding);
    } catch (error) {
      setCameraState(
        'error',
        error instanceof Error ? error.message : 'Face enrollment failed.',
      );
      setWorking(false);
    } finally {
      provider.dispose();
      providerRef.current = null;
    }
  };

  return (
    <main className="enrollment-screen">
      <header>
        <button
          className="text-button"
          disabled={working}
          onClick={() => setEnrollingPlayerId(null)}
        >
          ← Back to lobby
        </button>
        <span>ROOM {room.code}</span>
      </header>
      <section className="enrollment-content">
        <div className="enrollment-copy">
          <p className="eyebrow">Face enrollment · {player.name}</p>
          <h1>Look directly at the camera.</h1>
          <p>
            Keep one face centered and well lit while ten local samples are
            collected.
          </p>
          <div className="privacy-notice">
            <strong>Private by design</strong>
            <p>
              Face recognition runs locally on this device. Only a temporary
              mathematical embedding is shared with this room. No camera image
              is uploaded or stored.
            </p>
          </div>
          {visionError ? (
            <p className="error-message" role="alert">
              {visionError}
            </p>
          ) : null}
          <button
            className="primary-button enrollment-action"
            disabled={working || visionState !== 'camera-ready'}
            onClick={() => void beginEnrollment()}
          >
            {working
              ? `COLLECTING · ${Math.round(progress * 10)} / 10`
              : visionState === 'camera-ready'
                ? 'BEGIN ENROLLMENT'
                : visionState === 'error'
                  ? 'CAMERA UNAVAILABLE'
                  : 'STARTING CAMERA…'}
          </button>
        </div>
        <div className="enrollment-camera">
          <video ref={videoRef} muted playsInline />
          <div className="face-guide">
            <span />
          </div>
          <div className="progress-track">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      </section>
    </main>
  );
}
