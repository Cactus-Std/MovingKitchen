import { useEffect, useRef } from 'react';
import { CameraError, CameraService } from '../vision/cameraService';
import { useVisionStore } from '../stores/visionStore';

export function useCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const setCameraState = useVisionStore((state) => state.setCameraState);

  useEffect(() => {
    const video = videoRef.current;
    if (!enabled || !video) return;

    const camera = new CameraService();
    let cancelled = false;
    setCameraState('loading', null);
    void camera
      .start(video)
      .then(() => {
        if (!cancelled) setCameraState('camera-ready', null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof CameraError
            ? error.message
            : 'The camera could not be started.';
        setCameraState('error', message);
      });

    return () => {
      cancelled = true;
      camera.stop();
      video.srcObject = null;
    };
  }, [enabled, setCameraState]);

  return videoRef;
}
