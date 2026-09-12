import { useEffect, useRef, useState } from "react";
import type { CameraAssets } from "./camera";
import { useHandCamera } from "./useHandCamera";
import { KitchenInputController, contextKey } from "./KitchenInputController";
import {
  INPUT_CONTRACT_VERSION,
  type InputContext,
  type InteractionTarget,
  type IntentResult,
  type KitchenIntent,
  type KitchenInputView,
  type PoseSample,
} from "./contracts";
import type { Frame, Source } from "./types";
import { runtimeErrorText, text, type Language } from "../i18n";

export interface KitchenInputOptions {
  enabled: boolean;
  cameraOn: boolean;
  language?: Language;
  assets?: CameraAssets;
  context: InputContext;
  getTargets(): InteractionTarget[];
  onIntent(intent: KitchenIntent): Promise<IntentResult>;
  onPose?(pose: PoseSample): void;
}
export function useKitchenInput(options: KitchenInputOptions) {
  const language = options.language ?? "zh";
  const controller = useRef(new KitchenInputController(language));
  controller.current.setLanguage(language);
  const latest = useRef(options);
  latest.current = options;
  const active = useRef(true);
  const flight = useRef<{ id: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [view, setView] = useState<KitchenInputView>({
    ...controller.current.view,
    held: options.context.held,
    handState: options.context.held?.kind ?? "empty",
  });
  const publish = () => setView({ ...controller.current.view });
  const dispatch = (intent: KitchenIntent | null) => {
    const current = latest.current;
    if (
      !intent ||
      flight.current ||
      current.context.pending ||
      !current.enabled
    )
      return;
    flight.current = { id: intent.intentId, key: contextKey(current.context) };
    setBusy(true);
    setFeedback(null);
    void (async () => {
      let result: IntentResult;
      try {
        result = await current.onIntent(intent);
      } catch (error) {
        result = {
          ok: false,
          reason:
            error instanceof Error
              ? runtimeErrorText(language, error.message)
              : text(
                  language,
                  "The kitchen could not process that action. Try again.",
                  "宿主处理失败，请重试",
                ),
        };
      }
      if (!active.current || flight.current?.id !== intent.intentId) return;
      flight.current = null;
      setBusy(false);
      setFeedback(
        result.ok
          ? text(language, "Kitchen confirmed", "宿主已确认")
          : result.reason,
      );
    })();
  };
  const receive = (frame: Frame, source: Source) => {
    const current = latest.current;
    if (flight.current && flight.current.key !== contextKey(current.context)) {
      flight.current = null;
      setBusy(false);
      setFeedback(null);
    }
    const pending = !!flight.current || current.context.pending;
    const enabled = current.enabled && !document.hidden;
    const intent = controller.current.update(
      frame,
      { ...current.context, pending },
      current.getTargets(),
      enabled,
      source,
    );
    publish();
    if (enabled && !pending && current.context.playerId)
      current.onPose?.({
        inputVersion: INPUT_CONTRACT_VERSION,
        contextId: current.context.contextId,
        playerId: current.context.playerId,
        sceneId: current.context.sceneId,
        heldItemId: current.context.held?.id ?? null,
        source,
        detectedAt: frame.time,
        cursor: controller.current.view.cursor,
        rotationRad: controller.current.view.rotationRad,
      });
    dispatch(intent);
  };
  const camera = useHandCamera({
    cameraOn: options.cameraOn,
    language,
    assets: options.assets,
    onTrackingReset: () => {
      controller.current.resetMotion();
      publish();
    },
    onFrame: (frame) => receive(frame, "gesture"),
  });
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      flight.current = null;
    };
  }, []);
  const key = contextKey(options.context);
  useEffect(() => {
    controller.current.resetMotion();
    controller.current.view.held = options.context.held;
    controller.current.view.handState = options.context.held?.kind ?? "empty";
    publish();
    flight.current = null;
    setBusy(false);
    setFeedback(null);
  }, [key]);
  useEffect(() => {
    if (!options.enabled) {
      controller.current.resetMotion();
      publish();
    }
  }, [options.enabled]);
  return {
    ...camera,
    view,
    pending: busy || options.context.pending,
    feedback,
    resetTracking: () => {
      controller.current.resetMotion();
      publish();
    },
    debugTarget: (id: string) => {
      const target = latest.current
        .getTargets()
        .find((target) => target.id === id);
      if (target)
        dispatch(
          controller.current.confirm(
            target,
            latest.current.context,
            performance.now(),
            "debug",
          ),
        );
    },
    debugAction: () =>
      dispatch(
        controller.current.debugAction(
          latest.current.context,
          performance.now(),
        ),
      ),
    debugPose: (x: number, y: number, rotationRad = 0) =>
      receive(
        {
          time: performance.now(),
          hands: [
            {
              id: "debug-pointer",
              palm: { x, y },
              angle: rotationRad,
              open: true,
              fist: false,
              pinch: 0.8,
              points: [],
            },
          ],
        },
        "debug",
      ),
    debugLeave: () => receive({ time: performance.now(), hands: [] }, "debug"),
  };
}
