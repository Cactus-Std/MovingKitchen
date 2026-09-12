// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useKitchenInput, type KitchenInputOptions } from "./useKitchenInput";
import type { Frame } from "./types";
import type { IntentResult, KitchenInputView } from "./contracts";
const fake = vi.hoisted(() => ({
  frame: null as null | ((frame: Frame) => void),
}));
vi.mock("./useHandCamera", () => ({
  useHandCamera: (options: { onFrame(frame: Frame): void }) => {
    fake.frame = options.onFrame;
    return {
      videoRef: { current: null },
      status: "ready",
      error: null,
      hands: [],
      inferenceMs: 0,
      loadingStep: "model",
      retry: () => {},
    };
  },
}));
const deferred = () => {
  let resolve!: (value: IntentResult) => void;
  const promise = new Promise<IntentResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const food = { id: "tomato", kind: "ingredient" as const, label: "番茄" };
const options = (): KitchenInputOptions => ({
  enabled: true,
  cameraOn: true,
  context: {
    contextId: "r1",
    playerId: "p1",
    sceneId: "fridge",
    held: null,
    actionTarget: null,
    pending: false,
  },
  getTargets: () => [
    {
      id: "food",
      kind: "pickup",
      label: "番茄",
      item: food,
      allowed: true,
      bounds: { x: 0, y: 0, width: 1, height: 1 },
    },
  ],
  onIntent: async () => ({ ok: true }),
});
beforeEach(() =>
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  }),
);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("allows only one unacknowledged request and waits for host-owned held state", async () => {
  const pending = deferred(),
    onIntent = vi.fn(() => pending.promise),
    props = { ...options(), onIntent };
  const { result, rerender } = renderHook(useKitchenInput, {
    initialProps: props,
  });
  const typedView: KitchenInputView = result.current.view;
  expect(typedView.handState).toBe("empty");
  act(() => {
    result.current.debugTarget("food");
    result.current.debugTarget("food");
  });
  expect(onIntent).toHaveBeenCalledTimes(1);
  expect(result.current.pending).toBe(true);
  expect(result.current.view.held).toBeNull();
  await act(async () => {
    pending.resolve({ ok: true });
    await pending.promise;
  });
  expect(result.current.pending).toBe(false);
  expect(result.current.view.held).toBeNull();
  rerender({ ...props, context: { ...props.context, held: food } });
  expect(result.current.view.held).toEqual(food);
});
it("ignores stale acknowledgements after the player or round changes", async () => {
  const pending = deferred(),
    props = { ...options(), onIntent: vi.fn(() => pending.promise) };
  const { result, rerender } = renderHook(useKitchenInput, {
    initialProps: props,
  });
  act(() => result.current.debugTarget("food"));
  rerender({
    ...props,
    context: { ...props.context, playerId: "p2", contextId: "r2" },
  });
  await act(async () => {
    pending.resolve({ ok: false, reason: "old rejection" });
    await pending.promise;
  });
  expect(result.current.feedback).toBeNull();
  expect(result.current.pending).toBe(false);
});
it("provides continuous pose metadata and emits no pose or command while disabled", () => {
  const onPose = vi.fn(),
    onIntent = vi.fn(async () => ({ ok: true as const })),
    props = { ...options(), onPose, onIntent };
  const { result, rerender } = renderHook(useKitchenInput, {
    initialProps: props,
  });
  act(() =>
    fake.frame!({
      time: 0,
      hands: [
        {
          id: "h",
          palm: { x: 0.3, y: 0.4 },
          open: true,
          fist: false,
          pinch: 0.8,
          angle: 0.5,
          points: [],
        },
      ],
    }),
  );
  expect(onPose).toHaveBeenLastCalledWith(
    expect.objectContaining({
      cursor: { x: 0.3, y: 0.4 },
      rotationRad: 0.5,
      heldItemId: null,
      playerId: "p1",
      sceneId: "fridge",
      source: "gesture",
    }),
  );
  rerender({ ...props, enabled: false });
  act(() => {
    result.current.debugTarget("food");
    fake.frame!({ time: 100, hands: [] });
  });
  expect(onIntent).not.toHaveBeenCalled();
  expect(onPose).toHaveBeenCalledTimes(1);
});
it("handles host failure visibly and does not update the carried item locally", async () => {
  const props = {
    ...options(),
    onIntent: vi.fn(async () => {
      throw new Error("连接中断");
    }),
  };
  const { result } = renderHook(useKitchenInput, { initialProps: props });
  await act(async () => result.current.debugTarget("food"));
  expect(result.current.feedback).toBe("连接中断");
  expect(result.current.pending).toBe(false);
  expect(result.current.view.held).toBeNull();
});
it("clears a stopped camera pose without clearing host-owned carried food", () => {
  const props = options();
  props.context.held = food;
  const { result } = renderHook(useKitchenInput, { initialProps: props });
  act(() =>
    fake.frame!({
      time: 0,
      hands: [
        {
          id: "h",
          palm: { x: 0.3, y: 0.4 },
          open: true,
          fist: false,
          pinch: 0.8,
          angle: 0.5,
          points: [],
        },
      ],
    }),
  );
  expect(result.current.view.cursor).not.toBeNull();
  act(() => result.current.resetTracking());
  expect(result.current.view.cursor).toBeNull();
  expect(result.current.view.rotationRad).toBeNull();
  expect(result.current.view.held).toEqual(food);
});
