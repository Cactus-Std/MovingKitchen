import { useEffect, type RefObject } from 'react';
import { useVisionStore } from '../stores/visionStore';
import { FACE_DETECTION_INTERVAL_MS } from '../vision/config';
import { MediaPipeFaceDetector } from '../vision/faceDetector';

export function useFaceDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
): void {
  const setDetectionMetrics = useVisionStore(
    (state) => state.setDetectionMetrics,
  );
  const setCameraState = useVisionStore((state) => state.setCameraState);

  useEffect(() => {
    if (!enabled) return;
    const detector = new MediaPipeFaceDetector();
    let cancelled = false;
    let timeoutId: number | undefined;
    let previousAttemptAt = performance.now();

    const schedule = () => {
      timeoutId = window.setTimeout(runDetection, FACE_DETECTION_INTERVAL_MS);
    };
    const runDetection = () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const now = performance.now();
        const result = detector.detect(video, now);
        const fps = 1_000 / Math.max(1, now - previousAttemptAt);
        previousAttemptAt = now;
        setDetectionMetrics(result.count, result.confidence, fps);
      }
      schedule();
    };

    void detector
      .initialize()
      .then(() => {
        if (cancelled) detector.dispose();
        else schedule();
      })
      .catch(() => {
        if (!cancelled) {
          setCameraState(
            'error',
            'Face model failed to load. Check the local MediaPipe assets.',
          );
        }
      });

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      detector.dispose();
    };
  }, [enabled, setCameraState, setDetectionMetrics, videoRef]);
}
