import { useEffect, useRef, type RefObject } from 'react';
import type { Player } from '@roaming/shared';
import { useVisionStore } from '../stores/visionStore';
import { FACE_DETECTION_INTERVAL_MS } from '../vision/config';
import { MediaPipeOnnxFaceRecognitionProvider } from '../vision/MediaPipeOnnxFaceRecognitionProvider';
import { PredictionStabilizer } from '../vision/predictionStabilizer';

export function useFaceRecognition(
  videoRef: RefObject<HTMLVideoElement | null>,
  players: Player[],
  enabled: boolean,
): void {
  const setCameraState = useVisionStore((state) => state.setCameraState);
  const setDetectionMetrics = useVisionStore(
    (state) => state.setDetectionMetrics,
  );
  const setRecognitionResult = useVisionStore(
    (state) => state.setRecognitionResult,
  );
  const candidatesRef = useRef(
    players.flatMap((player) =>
      player.enrolled && player.faceEmbedding
        ? [{ playerId: player.id, embedding: player.faceEmbedding }]
        : [],
    ),
  );

  useEffect(() => {
    candidatesRef.current = players.flatMap((player) =>
      player.enrolled && player.faceEmbedding
        ? [{ playerId: player.id, embedding: player.faceEmbedding }]
        : [],
    );
  }, [players]);

  useEffect(() => {
    if (!enabled) return;
    if (candidatesRef.current.length === 0) return;

    const provider = new MediaPipeOnnxFaceRecognitionProvider();
    const stabilizer = new PredictionStabilizer();
    let cancelled = false;
    let timeoutId: number | undefined;
    let previousAttemptAt = performance.now();

    const schedule = () => {
      timeoutId = window.setTimeout(runRecognition, FACE_DETECTION_INTERVAL_MS);
    };
    const runRecognition = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const now = performance.now();
        try {
          const { matchThreshold, matchMargin } = useVisionStore.getState();
          const match = await provider.identify(
            video,
            candidatesRef.current,
            matchThreshold,
            matchMargin,
          );
          if (cancelled) return;
          const diagnostics = provider.getDiagnostics();
          setDetectionMetrics(
            diagnostics.detectedFaces,
            diagnostics.detectionConfidence,
            1_000 / Math.max(1, now - previousAttemptAt),
          );
          previousAttemptAt = now;
          const stabilized = stabilizer.update(match?.playerId ?? null);
          const stableConfidence =
            match?.playerId === stabilized.playerId
              ? match.similarity
              : useVisionStore.getState().confidence;
          setRecognitionResult(
            stabilized.playerId,
            match?.playerId ?? null,
            stabilized.playerId ? stableConfidence : null,
            match?.similarity ?? null,
            match?.secondBestPlayerId ?? null,
            match?.secondBestSimilarity ?? null,
          );
        } catch {
          if (!cancelled) {
            setCameraState(
              'error',
              'Face recognition failed. Reload the local model and try again.',
            );
          }
          return;
        }
      }
      schedule();
    };

    setCameraState('loading', null);
    void provider
      .initialize()
      .then(() => {
        if (cancelled) provider.dispose();
        else schedule();
      })
      .catch(() => {
        if (!cancelled) {
          setCameraState(
            'error',
            'Face recognition model failed to load from this device.',
          );
        }
      });

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      stabilizer.reset();
      provider.dispose();
      setRecognitionResult(null, null, null, null, null, null);
    };
  }, [
    enabled,
    setCameraState,
    setDetectionMetrics,
    setRecognitionResult,
    videoRef,
  ]);
}
