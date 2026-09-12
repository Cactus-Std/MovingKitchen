// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  cameraError,
  startCamera,
  type CameraDependencies,
  type Detector,
} from "./camera";
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
function setup() {
  const camera = deferred<MediaStream>(),
    model = deferred<Detector>();
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  const detector = {
    close: vi.fn(),
    detectForVideo: vi.fn(() => ({
      landmarks: [],
      worldLandmarks: [],
      handedness: [],
      handednesses: [],
    })),
  };
  const video = document.createElement("video");
  video.srcObject = null;
  video.play = vi.fn().mockResolvedValue(undefined);
  const callbacks = { onFrame: vi.fn(), onStatus: vi.fn() };
  const deps: CameraDependencies = {
    getStream: () => camera.promise,
    getDetector: () => model.promise,
    requestFrame: vi.fn(() => 7),
    cancelFrame: vi.fn(),
  };
  return { camera, model, track, stream, detector, video, callbacks, deps };
}
describe("camera resource lifecycle", () => {
  it("passes host asset locations to the detector factory without Vite configuration", async () => {
    const s = setup();
    const factory = vi.fn(() => s.model.promise);
    s.deps.getDetector = factory;
    const assets = {
      wasmRoot: "/host/static/wasm",
      modelAssetPath: "/host/static/hand.task",
    };
    const stop = startCamera(s.video, s.callbacks, assets, s.deps);
    s.camera.resolve(s.stream);
    s.model.resolve(s.detector);
    await flush();
    expect(factory).toHaveBeenCalledWith(assets);
    stop();
  });
  it("stops tracks when permission resolves after unmount", async () => {
    const s = setup();
    const stop = startCamera(s.video, s.callbacks, undefined, s.deps);
    stop();
    s.camera.resolve(s.stream);
    await flush();
    expect(s.track.stop).toHaveBeenCalledTimes(1);
    expect(s.video.srcObject).toBeNull();
    expect(s.deps.requestFrame).not.toHaveBeenCalled();
  });
  it("closes a model that resolves after stop", async () => {
    const s = setup();
    const stop = startCamera(s.video, s.callbacks, undefined, s.deps);
    s.camera.resolve(s.stream);
    await flush();
    stop();
    s.model.resolve(s.detector);
    await flush();
    expect(s.track.stop).toHaveBeenCalledTimes(1);
    expect(s.detector.close).toHaveBeenCalledTimes(1);
    expect(s.deps.requestFrame).not.toHaveBeenCalled();
  });
  it("cancels its frame loop, clears the stream, and closes the model once", async () => {
    const s = setup();
    const stop = startCamera(s.video, s.callbacks, undefined, s.deps);
    s.camera.resolve(s.stream);
    s.model.resolve(s.detector);
    await flush();
    expect(s.deps.requestFrame).toHaveBeenCalledOnce();
    stop();
    stop();
    expect(s.deps.cancelFrame).toHaveBeenCalledWith(7);
    expect(s.video.srcObject).toBeNull();
    expect(s.track.stop).toHaveBeenCalledOnce();
    expect(s.detector.close).toHaveBeenCalledOnce();
  });
  it("stops the camera if the model fails and exposes a recoverable error", async () => {
    const s = setup();
    startCamera(s.video, s.callbacks, undefined, s.deps);
    s.camera.resolve(s.stream);
    await flush();
    s.model.reject(new Error("model download failed"));
    await flush();
    expect(s.track.stop).toHaveBeenCalledOnce();
    expect(s.callbacks.onStatus).toHaveBeenLastCalledWith(
      "error",
      expect.any(String),
    );
  });
  it("reports permission denial without starting inference", async () => {
    const s = setup();
    startCamera(s.video, s.callbacks, undefined, s.deps);
    s.camera.reject(new DOMException("denied", "NotAllowedError"));
    await flush();
    expect(s.callbacks.onStatus).toHaveBeenLastCalledWith(
      "denied",
      expect.any(String),
    );
    expect(s.deps.requestFrame).not.toHaveBeenCalled();
  });
  it("does not duplicate inference on the same decoded frame", async () => {
    const s = setup();
    let callback: FrameRequestCallback = () => {};
    s.deps.requestFrame = vi.fn((cb) => {
      callback = cb;
      return 1;
    });
    Object.defineProperty(s.video, "readyState", { value: 2 });
    s.video.currentTime = 1;
    const stop = startCamera(s.video, s.callbacks, undefined, s.deps);
    s.camera.resolve(s.stream);
    s.model.resolve(s.detector);
    await flush();
    callback(100);
    callback(200);
    expect(s.detector.detectForVideo).toHaveBeenCalledTimes(1);
    s.video.currentTime = 2;
    callback(300);
    expect(s.detector.detectForVideo).toHaveBeenCalledTimes(2);
    expect(s.callbacks.onStatus).toHaveBeenLastCalledWith("no-hand", null);
    stop();
  });
  it("explains missing and busy camera errors", () => {
    expect(
      cameraError(new DOMException("", "NotFoundError")).message,
    ).toContain("未找到");
    expect(
      cameraError(new DOMException("", "NotReadableError")).message,
    ).toContain("占用");
  });
});
