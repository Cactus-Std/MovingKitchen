import type { FaceCandidate, FaceMatch } from './embeddingMath';

export interface FaceRecognitionProvider {
  initialize(): Promise<void>;
  enroll(
    video: HTMLVideoElement,
    onProgress?: (progress: number) => void,
  ): Promise<number[]>;
  identify(
    video: HTMLVideoElement,
    candidates: FaceCandidate[],
    threshold?: number,
    margin?: number,
  ): Promise<FaceMatch | null>;
  dispose(): void;
}
