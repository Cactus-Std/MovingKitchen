import type { PlayerId } from '@roaming/shared';
import { create } from 'zustand';
import { FACE_MATCH_MARGIN, FACE_MATCH_THRESHOLD } from '../vision/config';

export type VisionState =
  | 'idle'
  | 'loading'
  | 'camera-ready'
  | 'enrolling'
  | 'recognizing'
  | 'recognized'
  | 'unknown'
  | 'ambiguous'
  | 'error';

interface VisionStore {
  state: VisionState;
  recognizedPlayerId: PlayerId | null;
  confidence: number | null;
  rawMatchedPlayerId: PlayerId | null;
  rawMatchSimilarity: number | null;
  secondBestPlayerId: PlayerId | null;
  secondBestSimilarity: number | null;
  error: string | null;
  detectedFaces: number;
  detectionConfidence: number | null;
  recognitionFps: number;
  matchThreshold: number;
  matchMargin: number;
  setCameraState: (state: VisionState, error: string | null) => void;
  setDetectionMetrics: (
    detectedFaces: number,
    confidence: number | null,
    fps: number,
  ) => void;
  setDebugIdentity: (playerId: PlayerId | null) => void;
  setRecognitionResult: (
    stablePlayerId: PlayerId | null,
    rawMatchedPlayerId: PlayerId | null,
    stableConfidence: number | null,
    rawMatchSimilarity: number | null,
    secondBestPlayerId: PlayerId | null,
    secondBestSimilarity: number | null,
  ) => void;
  setMatchThreshold: (threshold: number) => void;
  setMatchMargin: (margin: number) => void;
  resetIdentity: () => void;
}

export const useVisionStore = create<VisionStore>((set) => ({
  state: 'idle',
  recognizedPlayerId: null,
  confidence: null,
  rawMatchedPlayerId: null,
  rawMatchSimilarity: null,
  secondBestPlayerId: null,
  secondBestSimilarity: null,
  error: null,
  detectedFaces: 0,
  detectionConfidence: null,
  recognitionFps: 0,
  matchThreshold: FACE_MATCH_THRESHOLD,
  matchMargin: FACE_MATCH_MARGIN,
  setCameraState: (state, error) => set({ state, error }),
  setDetectionMetrics: (detectedFaces, detectionConfidence, recognitionFps) =>
    set((current) => ({
      state:
        detectedFaces > 1
          ? 'ambiguous'
          : current.recognizedPlayerId
            ? 'recognized'
            : detectedFaces === 1
              ? 'recognizing'
              : 'unknown',
      detectedFaces,
      detectionConfidence,
      recognitionFps,
      error: null,
    })),
  setDebugIdentity: (recognizedPlayerId) =>
    set({
      state: recognizedPlayerId ? 'recognized' : 'unknown',
      recognizedPlayerId,
      confidence: recognizedPlayerId ? 1 : null,
      rawMatchedPlayerId: null,
      rawMatchSimilarity: null,
    }),
  setRecognitionResult: (
    recognizedPlayerId,
    rawMatchedPlayerId,
    confidence,
    rawMatchSimilarity,
    secondBestPlayerId,
    secondBestSimilarity,
  ) =>
    set((state) => ({
      state:
        state.detectedFaces > 1
          ? 'ambiguous'
          : recognizedPlayerId
            ? 'recognized'
            : state.detectedFaces === 1
              ? 'recognizing'
              : 'unknown',
      recognizedPlayerId,
      rawMatchedPlayerId,
      rawMatchSimilarity,
      confidence,
      secondBestPlayerId,
      secondBestSimilarity,
      error: null,
    })),
  setMatchThreshold: (matchThreshold) => set({ matchThreshold }),
  setMatchMargin: (matchMargin) => set({ matchMargin }),
  resetIdentity: () =>
    set({
      state: 'idle',
      recognizedPlayerId: null,
      confidence: null,
      rawMatchedPlayerId: null,
      rawMatchSimilarity: null,
      secondBestPlayerId: null,
      secondBestSimilarity: null,
      error: null,
      detectedFaces: 0,
      detectionConfidence: null,
      recognitionFps: 0,
    }),
}));
