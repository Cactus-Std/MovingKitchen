import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  initialize: vi.fn(),
  identify: vi.fn(),
  enroll: vi.fn(),
  dispose: vi.fn(),
  presence: vi.fn(),
  command: vi.fn(),
}));
vi.mock("./vision/MediaPipeOnnxFaceRecognitionProvider", () => ({
  MediaPipeOnnxFaceRecognitionProvider: class {
    initialize = fake.initialize;
    identify = fake.identify;
    enroll = fake.enroll;
    dispose = fake.dispose;
  },
}));
vi.mock("./network", () => ({
  presence: fake.presence,
  command: fake.command,
  roomMeta: () => ({
    roomCode: "ROOM",
    deviceId: "device",
    protocolVersion: 1,
    requestId: "request",
  }),
}));
import { useIdentity } from "./useIdentity";
import { FACE_MODEL } from "@kitchen/shared";
const roster = [{ playerId: "chef", template: { ...FACE_MODEL, vector: [1] } }];
const video = { current: { readyState: 2 } as HTMLVideoElement };
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Object.defineProperty(document, "hidden", {
    value: false,
    configurable: true,
  });
  Object.defineProperty(video.current, "currentTime", {
    get: () => performance.now() / 1000,
    configurable: true,
  });
  fake.initialize.mockResolvedValue(undefined);
  fake.identify.mockResolvedValue({ playerId: "chef", similarity: 0.9 });
  fake.enroll.mockResolvedValue([1]);
  fake.command.mockResolvedValue({ ok: true });
  fake.presence.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("acquires the same stable identity within 350ms when inference is fast", async () => {
  const { result } = renderHook(() =>
    useIdentity(video, true, roster, null, "ROOM"),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
  expect(result.current.locked).toBe("chef");
});
it("suspends controls during a different-player candidate while keeping brief misses uninterrupted", async () => {
  const candidates = [
    ...roster,
    { playerId: "other", template: { ...FACE_MODEL, vector: [-1] } },
  ];
  const { result } = renderHook(() =>
    useIdentity(video, true, candidates, null, "ROOM"),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
  fake.identify.mockResolvedValue(null);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(result.current.locked).toBe("chef");
  expect(result.current.switching).toBe(false);
  fake.identify.mockResolvedValue({ playerId: "other", similarity: 0.9 });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(result.current.locked).toBe("chef");
  expect(result.current.switching).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  expect(result.current.locked).toBe("other");
  expect(result.current.switching).toBe(false);
});
it("keeps recognizing while an identity network acknowledgement is delayed", async () => {
  fake.presence.mockImplementation(() => new Promise(() => {}));
  renderHook(() => useIdentity(video, true, roster, null, "ROOM"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1200);
  });
  expect(fake.identify.mock.calls.length).toBeGreaterThan(5);
});
it("reuses the loaded model across enrollment and roster updates", async () => {
  const hook = renderHook(
    ({ candidates }) => useIdentity(video, true, candidates, null, "ROOM"),
    { initialProps: { candidates: roster } },
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  await act(async () => {
    await hook.result.current.enroll("chef");
  });
  hook.rerender({ candidates: [...roster] });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(fake.initialize).toHaveBeenCalledTimes(1);
});
it("reports loading, partial samples and saving before showing completion", async () => {
  let ready!: () => void, samples!: (v: number[]) => void, saved!: () => void;
  fake.initialize.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
  );
  fake.enroll.mockImplementation((_video, onProgress) => {
    onProgress(0.4);
    return new Promise<number[]>((resolve) => {
      samples = resolve;
    });
  });
  fake.command.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        saved = resolve;
      }),
  );
  const { result } = renderHook(() =>
    useIdentity(video, true, roster, null, "ROOM"),
  );
  let work!: Promise<void>;
  act(() => {
    work = result.current.enroll("chef");
  });
  expect(result.current.phase).toBe("loading");
  await act(async () => {
    ready();
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(result.current.phase).toBe("sampling");
  expect(result.current.progress).toBe(0.4);
  await act(async () => {
    samples([1]);
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(result.current.phase).toBe("saving");
  expect(result.current.enrolling).toBe(true);
  await act(async () => {
    saved();
    await work;
  });
  expect(result.current.phase).toBe("complete");
  expect(result.current.enrolling).toBe(false);
});
it("finishes a running recognition frame before enrollment uses the same model", async () => {
  let resolve!: (value: null) => void;
  fake.identify.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { result } = renderHook(() =>
    useIdentity(video, true, roster, null, "ROOM"),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  let work!: Promise<void>;
  act(() => {
    work = result.current.enroll("chef");
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  expect(fake.enroll).not.toHaveBeenCalled();
  await act(async () => {
    resolve(null);
    await work;
  });
  expect(fake.enroll).toHaveBeenCalledOnce();
});
it("discards late results and releases an in-flight model on camera shutdown", async () => {
  let resolve!: (value: { playerId: string; similarity: number }) => void;
  fake.identify.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const hook = renderHook(
    ({ enabled }) => useIdentity(video, enabled, roster, null, "ROOM"),
    { initialProps: { enabled: true } },
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  hook.rerender({ enabled: false });
  expect(fake.dispose).not.toHaveBeenCalled();
  await act(async () => {
    resolve({ playerId: "chef", similarity: 0.9 });
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(hook.result.current.locked).toBeNull();
  expect(fake.dispose).toHaveBeenCalledOnce();
});
it("tolerates brief misses, clears after three seconds, and never chooses a default player", async () => {
  const { result } = renderHook(() =>
    useIdentity(video, true, roster, null, "ROOM"),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
  expect(result.current.locked).toBe("chef");
  fake.identify.mockResolvedValue(null);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(result.current.locked).toBe("chef");
  expect(result.current.absent).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1200);
  });
  expect(result.current.locked).toBeNull();
  expect(result.current.absent).toBe(true);
  const cleared = fake.presence.mock.calls.findIndex(
    ([, evidence]) => evidence === "cleared",
  );
  expect(cleared).toBeGreaterThan(-1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(result.current.locked).toBeNull();
  expect(fake.presence.mock.calls.slice(cleared + 1)).toHaveLength(0);
  fake.identify.mockResolvedValue({ playerId: "chef", similarity: 0.9 });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  expect(result.current.locked).toBe("chef");
  expect(result.current.absent).toBe(false);
});
it("expires a locked identity if video frames stop advancing", async () => {
  const { result } = renderHook(() =>
    useIdentity(video, true, roster, null, "ROOM"),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
  Object.defineProperty(video.current, "currentTime", {
    value: 0.3,
    configurable: true,
  });
  const calls = fake.identify.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
  expect(fake.identify).toHaveBeenCalledTimes(calls);
  expect(result.current.locked).toBeNull();
  expect(result.current.absent).toBe(true);
});
it("expires even while a slow inference is still pending, without using its late result as a lock", async () => {
  const { result } = renderHook(() =>
    useIdentity(video, true, roster, null, "ROOM"),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
  let complete!: (match: { playerId: string; similarity: number }) => void;
  fake.identify
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    )
    .mockResolvedValue(null);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
  expect(result.current.locked).toBeNull();
  await act(async () => {
    complete({ playerId: "chef", similarity: 0.9 });
    await vi.advanceTimersByTimeAsync(50);
  });
  expect(result.current.locked).toBeNull();
});
