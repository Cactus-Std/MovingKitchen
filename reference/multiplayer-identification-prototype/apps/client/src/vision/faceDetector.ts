import type { Detection, FaceDetector } from '@mediapipe/tasks-vision';
import { FACE_DETECTION_MIN_CONFIDENCE } from './config';

export interface FaceDetectionSummary {
  count: number;
  confidence: number | null;
  detections: Detection[];
}

export class MediaPipeFaceDetector {
  private detector: FaceDetector | null = null;

  async initialize(): Promise<void> {
    const { FaceDetector, FilesetResolver } =
      await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks('/mediapipe');
    this.detector = await FaceDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: '/models/blaze_face_short_range.tflite',
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      minDetectionConfidence: FACE_DETECTION_MIN_CONFIDENCE,
      minSuppressionThreshold: 0.3,
    });
  }

  detect(
    video: HTMLVideoElement,
    timestampMs = performance.now(),
  ): FaceDetectionSummary {
    if (!this.detector) throw new Error('Face detector is not initialized.');
    const result = this.detector.detectForVideo(video, timestampMs);
    return {
      count: result.detections.length,
      confidence: result.detections[0]?.categories[0]?.score ?? null,
      detections: result.detections,
    };
  }

  dispose(): void {
    this.detector?.close();
    this.detector = null;
  }
}
