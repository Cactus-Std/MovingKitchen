import type { Detection } from '@mediapipe/tasks-vision';
import type { InferenceSession } from 'onnxruntime-web';
import {
  averageEmbeddings,
  normalizeEmbedding,
  selectBestFaceMatch,
  type FaceCandidate,
  type FaceMatch,
} from './embeddingMath';
import type { FaceRecognitionProvider } from './faceRecognitionProvider';
import { MediaPipeFaceDetector } from './faceDetector';
import {
  FACE_DETECTION_INTERVAL_MS,
  FACE_ENROLLMENT_MIN_WIDTH_RATIO,
  FACE_MIN_INSIDE_RATIO,
  FACE_RECOGNITION_MIN_WIDTH_RATIO,
} from './config';

const EMBEDDING_SIZE = 112;
const ENROLLMENT_SAMPLE_COUNT = 10;
const ENROLLMENT_TIMEOUT_MS = 12_000;
const MODEL_PATH = '/models/facex_tiny.enc';

export interface RecognitionDiagnostics {
  detectedFaces: number;
  detectionConfidence: number | null;
}

const keyPartOne = new Uint8Array([
  0x42, 0x8a, 0x2f, 0x98, 0xd7, 0x28, 0xae, 0x22, 0x71, 0x37, 0x44, 0x91, 0x23,
  0xef, 0x65, 0xcd, 0xb5, 0xc0, 0xfb, 0xcf, 0xec, 0x4d, 0x3b, 0x2f, 0xe9, 0xb5,
  0xdb, 0xa5, 0x81, 0x89, 0xdb, 0xbc,
]);
const keyPartTwo = new Uint8Array([
  0xb7, 0x4d, 0xb2, 0x24, 0xec, 0x76, 0x04, 0xe4, 0xcb, 0x46, 0xc8, 0x02, 0x97,
  0x3c, 0x33, 0xfa, 0x8b, 0xb0, 0x11, 0x60, 0x0c, 0xd5, 0x02, 0xf3, 0xac, 0xb8,
  0x62, 0x0c, 0xf3, 0xad, 0x54, 0x01,
]);

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function isUsableFace(
  detection: Detection,
  video: HTMLVideoElement,
  minimumWidthRatio: number,
): boolean {
  const box = detection.boundingBox;
  if (!box || box.width / video.videoWidth < minimumWidthRatio) return false;
  const left = Math.max(0, box.originX);
  const top = Math.max(0, box.originY);
  const right = Math.min(video.videoWidth, box.originX + box.width);
  const bottom = Math.min(video.videoHeight, box.originY + box.height);
  const insideArea = Math.max(0, right - left) * Math.max(0, bottom - top);
  return insideArea / (box.width * box.height) >= FACE_MIN_INSIDE_RATIO;
}

export class MediaPipeOnnxFaceRecognitionProvider implements FaceRecognitionProvider {
  private readonly detector = new MediaPipeFaceDetector();
  private readonly canvas = document.createElement('canvas');
  private session: InferenceSession | null = null;
  private disposed = false;
  private diagnostics: RecognitionDiagnostics = {
    detectedFaces: 0,
    detectionConfidence: null,
  };

  constructor() {
    this.canvas.width = EMBEDDING_SIZE;
    this.canvas.height = EMBEDDING_SIZE;
  }

  async initialize(): Promise<void> {
    this.disposed = false;
    const [ort] = await Promise.all([
      import('onnxruntime-web'),
      this.detector.initialize(),
    ]);
    ort.env.wasm.wasmPaths = '/onnxruntime/';
    ort.env.wasm.numThreads = 1;

    const encrypted = new Uint8Array(
      await (await fetch(MODEL_PATH)).arrayBuffer(),
    );
    const keyBytes = keyPartOne.map(
      (value, index) => value ^ (keyPartTwo[index] ?? 0),
    );
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
    const modelBytes = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: encrypted.subarray(0, 12) },
        key,
        encrypted.subarray(12),
      ),
    );
    keyBytes.fill(0);
    this.session = await ort.InferenceSession.create(modelBytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    modelBytes.fill(0);
  }

  async enroll(
    video: HTMLVideoElement,
    onProgress?: (progress: number) => void,
  ): Promise<number[]> {
    this.requireSession();
    const samples: number[][] = [];
    const deadline = performance.now() + ENROLLMENT_TIMEOUT_MS;

    while (
      !this.disposed &&
      samples.length < ENROLLMENT_SAMPLE_COUNT &&
      performance.now() < deadline
    ) {
      const embedding = await this.captureEmbedding(
        video,
        FACE_ENROLLMENT_MIN_WIDTH_RATIO,
      );
      if (embedding) {
        samples.push(embedding);
        onProgress?.(samples.length / ENROLLMENT_SAMPLE_COUNT);
      }
      await wait(FACE_DETECTION_INTERVAL_MS);
    }

    if (samples.length < ENROLLMENT_SAMPLE_COUNT) {
      throw new Error(
        'Face enrollment timed out. Keep one well-lit face centered in the frame.',
      );
    }
    return averageEmbeddings(samples);
  }

  async identify(
    video: HTMLVideoElement,
    candidates: FaceCandidate[],
    threshold?: number,
    margin?: number,
  ): Promise<FaceMatch | null> {
    this.requireSession();
    const embedding = await this.captureEmbedding(
      video,
      FACE_RECOGNITION_MIN_WIDTH_RATIO,
    );
    return embedding
      ? selectBestFaceMatch(embedding, candidates, threshold, margin)
      : null;
  }

  dispose(): void {
    this.disposed = true;
    this.detector.dispose();
    this.session?.release();
    this.session = null;
  }

  getDiagnostics(): RecognitionDiagnostics {
    return this.diagnostics;
  }

  private requireSession(): InferenceSession {
    if (!this.session)
      throw new Error('Face recognition provider is not initialized.');
    return this.session;
  }

  private async captureEmbedding(
    video: HTMLVideoElement,
    minimumWidthRatio: number,
  ): Promise<number[] | null> {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.diagnostics = { detectedFaces: 0, detectionConfidence: null };
      return null;
    }
    const detectionResult = this.detector.detect(video);
    this.diagnostics = {
      detectedFaces: detectionResult.count,
      detectionConfidence: detectionResult.confidence,
    };
    const detection = detectionResult.detections[0];
    if (
      detectionResult.count !== 1 ||
      !detection ||
      !isUsableFace(detection, video, minimumWidthRatio)
    )
      return null;

    const input = this.createAlignedInput(video, detection);
    const ort = await import('onnxruntime-web');
    const tensor = new ort.Tensor('float32', input, [
      1,
      3,
      EMBEDDING_SIZE,
      EMBEDDING_SIZE,
    ]);
    const session = this.requireSession();
    const output = await session.run({
      [session.inputNames[0] ?? 'input']: tensor,
    });
    const result = output[session.outputNames[0] ?? 'embedding'];
    if (!result)
      throw new Error('The face embedding model returned no output.');
    return normalizeEmbedding(Array.from(result.data as Float32Array));
  }

  private createAlignedInput(
    video: HTMLVideoElement,
    detection: Detection,
  ): Float32Array {
    const context = this.canvas.getContext('2d', { willReadFrequently: true });
    const eyes = detection.keypoints
      .slice(0, 2)
      .sort((first, second) => first.x - second.x);
    const leftEye = eyes[0];
    const rightEye = eyes[1];
    if (!context || !leftEye || !rightEye)
      throw new Error('Face alignment landmarks are unavailable.');

    const leftX = leftEye.x * video.videoWidth;
    const leftY = leftEye.y * video.videoHeight;
    const rightX = rightEye.x * video.videoWidth;
    const rightY = rightEye.y * video.videoHeight;
    const eyeCenterX = (leftX + rightX) / 2;
    const eyeCenterY = (leftY + rightY) / 2;
    const eyeDistance = Math.hypot(rightX - leftX, rightY - leftY);
    const angle = Math.atan2(rightY - leftY, rightX - leftX);
    const scale = 40 / Math.max(1, eyeDistance);
    const cosine = Math.cos(-angle) * scale;
    const sine = Math.sin(-angle) * scale;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#000';
    context.fillRect(0, 0, EMBEDDING_SIZE, EMBEDDING_SIZE);
    context.setTransform(
      cosine,
      sine,
      -sine,
      cosine,
      56 - cosine * eyeCenterX + sine * eyeCenterY,
      42 - sine * eyeCenterX - cosine * eyeCenterY,
    );
    context.drawImage(video, 0, 0);
    context.setTransform(1, 0, 0, 1, 0, 0);

    const pixels = context.getImageData(
      0,
      0,
      EMBEDDING_SIZE,
      EMBEDDING_SIZE,
    ).data;
    const planeSize = EMBEDDING_SIZE * EMBEDDING_SIZE;
    const input = new Float32Array(planeSize * 3);
    for (let index = 0; index < planeSize; index += 1) {
      const pixelIndex = index * 4;
      input[index] = ((pixels[pixelIndex] ?? 0) - 127.5) / 128;
      input[planeSize + index] = ((pixels[pixelIndex + 1] ?? 0) - 127.5) / 128;
      input[planeSize * 2 + index] =
        ((pixels[pixelIndex + 2] ?? 0) - 127.5) / 128;
    }
    return input;
  }
}
