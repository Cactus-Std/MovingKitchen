export type CameraErrorCode =
  'CAMERA_PERMISSION_DENIED' | 'CAMERA_NOT_AVAILABLE' | 'CAMERA_START_FAILED';

export class CameraError extends Error {
  constructor(
    public readonly code: CameraErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CameraError';
  }
}

export class CameraService {
  private stream: MediaStream | null = null;

  async start(video: HTMLVideoElement): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new CameraError(
        'CAMERA_NOT_AVAILABLE',
        'Camera access is not available in this browser.',
      );
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      video.srcObject = this.stream;
      await video.play();
    } catch (error) {
      this.stop();
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        throw new CameraError(
          'CAMERA_PERMISSION_DENIED',
          'Camera permission was denied. Allow camera access and try again.',
        );
      }
      if (
        error instanceof DOMException &&
        ['NotFoundError', 'OverconstrainedError'].includes(error.name)
      ) {
        throw new CameraError(
          'CAMERA_NOT_AVAILABLE',
          'No compatible camera is available.',
        );
      }
      throw new CameraError(
        'CAMERA_START_FAILED',
        'The camera could not be started.',
      );
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
