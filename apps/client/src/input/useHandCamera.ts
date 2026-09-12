import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_CAMERA_ASSETS,
  startCamera,
  type CameraAssets,
} from "./camera";
import type { Frame, Hand, InputStatus } from "./types";
import { text, type Language } from "../i18n";

interface Options {
  cameraOn: boolean;
  language?: Language;
  assets?: CameraAssets;
  onFrame(frame: Frame): void;
  onTrackingReset(): void;
}
export function useHandCamera(options: Options) {
  const language = options.language ?? "zh";
  const videoRef = useRef<HTMLVideoElement>(null);
  const latest = useRef(options);
  latest.current = options;
  const [status, setStatus] = useState<InputStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hands, setHands] = useState<Hand[]>([]);
  const [inferenceMs, setInferenceMs] = useState(0);
  const [loadingStep, setLoadingStep] = useState<
    "permission" | "model" | "video"
  >("permission");
  const [attempt, setAttempt] = useState(0);
  const wasmRoot = options.assets?.wasmRoot ?? DEFAULT_CAMERA_ASSETS.wasmRoot;
  const modelAssetPath =
    options.assets?.modelAssetPath ?? DEFAULT_CAMERA_ASSETS.modelAssetPath;
  useEffect(() => {
    let active = true;
    latest.current.onTrackingReset();
    setHands([]);
    setError(null);
    if (!options.cameraOn) {
      setStatus("idle");
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError(
        text(
          language,
          "Camera access requires localhost or HTTPS. Open the app from a secure address.",
          "摄像头需要 localhost 或 HTTPS。请使用本机开发地址打开。",
        ),
      );
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    const stop = startCamera(
      video,
      {
        onLoading: (step) => {
          if (active) setLoadingStep(step);
        },
        onStatus: (next, message) => {
          if (!active) return;
          setStatus(next);
          setError(message);
          if (next === "denied" || next === "error") {
            latest.current.onTrackingReset();
            setHands([]);
          }
        },
        onFrame: (frame, duration) => {
          if (!active) return;
          latest.current.onFrame(frame);
          setHands(frame.hands);
          setInferenceMs(duration);
        },
      },
      { wasmRoot, modelAssetPath },
      undefined,
      language,
    );
    const onVisibility = () => latest.current.onTrackingReset();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [options.cameraOn, wasmRoot, modelAssetPath, attempt, language]);
  return {
    videoRef,
    status,
    error,
    hands,
    inferenceMs,
    loadingStep,
    retry: () => setAttempt((value) => value + 1),
  };
}
