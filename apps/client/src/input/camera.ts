import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { handFeatures } from "./features";
import { HandTracker } from "./handTracker";
import type { Frame, Hand, InputStatus } from "./types";
import { text, type Language } from "../i18n";

export interface CameraAssets {
  wasmRoot: string;
  modelAssetPath: string;
}
export const DEFAULT_CAMERA_ASSETS: CameraAssets = {
  wasmRoot: "/models/wasm",
  modelAssetPath: "/models/hand_landmarker.task",
};

export interface CameraCallbacks {
  onFrame(frame: Frame, inferenceMs: number): void;
  onStatus(status: InputStatus, error: string | null): void;
  onLoading?(step: "permission" | "model" | "video"): void;
}
export interface Detector {
  detectForVideo: HandLandmarker["detectForVideo"];
  close(): void;
}
export interface CameraDependencies {
  getStream(): Promise<MediaStream>;
  getDetector(assets: CameraAssets): Promise<Detector>;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
}
const dependencies: CameraDependencies = {
  getStream: () =>
    navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: "user",
      },
      audio: false,
    }),
  getDetector: async (assets) => {
    const files = await FilesetResolver.forVisionTasks(assets.wasmRoot);
    const create = (delegate: "GPU" | "CPU") =>
      HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: assets.modelAssetPath,
          delegate,
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
    try {
      return await create("GPU");
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      console.warn(
        "GPU model initialization failed; trying CPU.",
        error.message,
      );
      return await create("CPU");
    }
  },
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
};

export function cameraError(
  error: unknown,
  language: Language = "zh",
): {
  status: InputStatus;
  message: string;
} {
  const name =
    error instanceof Error || error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return {
      status: "denied",
      message: text(
        language,
        "Camera access is blocked. Allow camera access in the address bar, then try again.",
        "摄像头权限未开启。请在地址栏允许摄像头，然后重试。",
      ),
    };
  if (name === "NotFoundError")
    return {
      status: "error",
      message: text(
        language,
        "No camera was found. Connect one and try again, or use manual test mode.",
        "未找到摄像头。连接摄像头后重试，或打开模拟调试。",
      ),
    };
  if (name === "NotReadableError")
    return {
      status: "error",
      message: text(
        language,
        "The camera may be in use by another app. Close that app and try again.",
        "摄像头可能正被其他应用占用。关闭占用它的应用后重试。",
      ),
    };
  return {
    status: "error",
    message: text(
      language,
      "The camera or gesture model could not start. Try again and check the local model files.",
      "摄像头或手势模型启动失败。请重试，并确认本地模型资源完整。",
    ),
  };
}

// One session owns one stream, detector and frame loop. Late async results are disposed.
export function startCamera(
  video: HTMLVideoElement,
  callbacks: CameraCallbacks,
  assets: CameraAssets = DEFAULT_CAMERA_ASSETS,
  deps = dependencies,
  language: Language = "zh",
): () => void {
  let stopped = false;
  let stream: MediaStream | null = null;
  let detector: Detector | null = null;
  let requestId: number | null = null;
  let lastFrameTime = -Infinity;
  let lastVideoTime = -1;
  let status: InputStatus = "loading";
  const tracker = new HandTracker();
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (requestId !== null) deps.cancelFrame(requestId);
    stream?.getTracks().forEach((track) => track.stop());
    detector?.close();
    if (video.srcObject === stream) video.srcObject = null;
  };
  const fail = (error: unknown) => {
    if (stopped) return;
    const result = cameraError(error, language);
    stop();
    callbacks.onStatus(result.status, result.message);
  };
  const loop = (now: number) => {
    if (stopped) return;
    try {
      if (
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTime &&
        now - lastFrameTime >= 1000 / 30 - 1
      ) {
        lastVideoTime = video.currentTime;
        lastFrameTime = now;
        const began = performance.now();
        const result = detector!.detectForVideo(video, now);
        const detectedHands = result.landmarks
          .map((points, i) =>
            handFeatures(
              points,
              result.handedness[i]?.[0]?.categoryName ?? `hand-${i}`,
            ),
          )
          .filter((h): h is Hand => h !== null);
        const hands = tracker.update(detectedHands, now);
        const nextStatus = hands.length ? "ready" : "no-hand";
        if (nextStatus !== status) {
          status = nextStatus;
          callbacks.onStatus(status, null);
        }
        callbacks.onFrame({ time: now, hands }, performance.now() - began);
      }
      requestId = deps.requestFrame(loop);
    } catch (error) {
      fail(error);
    }
  };
  callbacks.onStatus("loading", null);
  callbacks.onLoading?.("permission");
  void (async () => {
    try {
      const acquired = await deps.getStream();
      if (stopped) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      video.srcObject = stream;
      stream
        .getVideoTracks()
        .forEach((track) =>
          track.addEventListener(
            "ended",
            () => fail(new DOMException("Camera ended", "NotReadableError")),
            { once: true },
          ),
        );
      callbacks.onLoading?.("video");
      await video.play();
      if (stopped) return;
      callbacks.onLoading?.("model");
      const loaded = await deps.getDetector(assets);
      if (stopped) {
        loaded.close();
        return;
      }
      detector = loaded;
      requestId = deps.requestFrame(loop);
    } catch (error) {
      fail(error);
    }
  })();
  return stop;
}
