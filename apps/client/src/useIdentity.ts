import { useEffect, useRef, useState, type RefObject } from "react";
import {
  FACE_MODEL,
  type IdentityCandidate,
  type Evidence,
} from "@kitchen/shared";
import { MediaPipeOnnxFaceRecognitionProvider } from "./vision/MediaPipeOnnxFaceRecognitionProvider";
import { PredictionStabilizer } from "./vision/predictionStabilizer";
import { FACE_RECOGNITION_INTERVAL_MS } from "./vision/config";
import { command, presence, roomMeta } from "./network";

export type EnrollmentPhase =
  "idle" | "loading" | "sampling" | "saving" | "complete" | "error";
interface RecognitionSession {
  provider: MediaPipeOnnxFaceRecognitionProvider;
  ready: Promise<void>;
  inference: Promise<unknown> | null;
  enrolling: boolean;
  cancelled: boolean;
  stabilizer: PredictionStabilizer;
  abort: AbortController;
}

export function useIdentity(
  video: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  roster: IdentityCandidate[],
  manual: string | null,
  sessionId: string | null,
) {
  const [locked, setLocked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState<EnrollmentPhase>("idle");
  const [enrollingPlayerId, setEnrollingPlayerId] = useState<string | null>(
    null,
  );
  const candidates = useRef(roster);
  candidates.current = roster;
  const sessionRef = useRef<RecognitionSession | null>(null);
  const enrolling =
    phase === "loading" || phase === "sampling" || phase === "saving";

  useEffect(() => {
    setLocked(null);
  }, [sessionId]);
  useEffect(() => {
    if (!manual || !sessionId) return;
    let active = true;
    const report = (e: Error) => {
      if (active) setError(e.message);
    };
    setError(null);
    setLocked(manual);
    void presence(manual, "manual-debug").catch(report);
    const timer = setInterval(() => {
      if (!document.hidden)
        void presence(manual, "lock-heartbeat").catch(report);
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [manual, sessionId]);

  useEffect(() => {
    setPhase("idle");
    setProgress(null);
    setEnrollingPlayerId(null);
    if (!enabled || manual || !sessionId) return;
    setError(null);
    const provider = new MediaPipeOnnxFaceRecognitionProvider();
    const session: RecognitionSession = {
      provider,
      ready: provider.initialize(),
      inference: null,
      enrolling: false,
      cancelled: false,
      stabilizer: new PredictionStabilizer(),
      abort: new AbortController(),
    };
    sessionRef.current = session;
    let timer = 0;
    let lastPositive = -Infinity;
    let lastHeartbeat = -Infinity;
    const report = (e: unknown) => {
      if (!session.cancelled)
        setError(e instanceof Error ? e.message : "身份识别失败，请重试。");
    };
    const publish = (
      playerId: string,
      evidence: Evidence,
      confidence: number | null = null,
    ) => {
      // Network latency must not stall local face inference.
      void presence(playerId, evidence, confidence).catch(report);
    };
    const run = async () => {
      if (session.cancelled) return;
      const began = performance.now();
      try {
        const v = video.current;
        if (
          !session.enrolling &&
          v &&
          v.readyState >= 2 &&
          !document.hidden &&
          candidates.current.length
        ) {
          const inference = provider.identify(
            v,
            candidates.current.map((c) => ({
              playerId: c.playerId,
              embedding: c.template.vector,
            })),
          );
          session.inference = inference;
          const match = await inference;
          if (session.cancelled) return;
          if (!session.enrolling) {
            const stable = session.stabilizer.update(match?.playerId ?? null);
            setLocked(stable.playerId);
            const now = performance.now();
            if (
              stable.playerId &&
              match?.playerId === stable.playerId &&
              (stable.changed || now - lastPositive >= 1000)
            ) {
              lastPositive = now;
              lastHeartbeat = now;
              publish(stable.playerId, "positive-match", match.similarity);
            } else if (stable.playerId && now - lastHeartbeat >= 1000) {
              lastHeartbeat = now;
              publish(stable.playerId, "lock-heartbeat");
            }
          }
        }
      } catch (e) {
        report(e);
      } finally {
        // Enrollment owns its inference slot while paused.
        if (!session.enrolling) session.inference = null;
      }
      if (!session.cancelled)
        timer = window.setTimeout(
          run,
          Math.max(
            0,
            FACE_RECOGNITION_INTERVAL_MS - (performance.now() - began),
          ),
        );
    };
    void session.ready
      .then(() => {
        if (!session.cancelled) void run();
      })
      .catch((e) => {
        report(e);
        provider.dispose();
      });
    return () => {
      session.cancelled = true;
      session.abort.abort();
      clearTimeout(timer);
      if (sessionRef.current === session) sessionRef.current = null;
      // Do not release an ONNX session while a frame is still using it.
      if (session.inference)
        void session.inference.then(
          () => provider.dispose(),
          () => provider.dispose(),
        );
      else provider.dispose();
    };
  }, [enabled, manual, sessionId, video]);

  useEffect(() => {
    let active = true;
    if (!enabled && !manual) {
      setLocked(null);
      void presence(null, "cleared").catch((e) => {
        if (active) setError(e.message);
      });
    }
    return () => {
      active = false;
    };
  }, [enabled, manual]);

  async function enroll(playerId: string) {
    const session = sessionRef.current;
    const v = video.current;
    if (!session || !v || v.readyState < 2) {
      setError("请先开启摄像头，等待画面出现。");
      return;
    }
    if (session.enrolling) return;
    const payload = { ...roomMeta(), playerId };
    session.enrolling = true;
    setEnrollingPlayerId(playerId);
    setPhase("loading");
    setProgress(0);
    setError(null);
    try {
      await session.ready;
      await session.inference;
      if (session.cancelled) return;
      setPhase("sampling");
      const inference = session.provider.enroll(
        v,
        (value) => {
          if (!session.cancelled) setProgress(value);
        },
        session.abort.signal,
      );
      session.inference = inference;
      const vector = await inference;
      session.inference = null;
      if (session.cancelled) return;
      setProgress(1);
      setPhase("saving");
      await command("player:enroll", {
        ...payload,
        template: { ...FACE_MODEL, vector },
      });
      if (!session.cancelled) {
        session.stabilizer.reset();
        setLocked(null);
        setPhase("complete");
      }
    } catch (e) {
      if (!session.cancelled) {
        setError(e instanceof Error ? e.message : "录脸失败。");
        setPhase("error");
      }
    } finally {
      session.enrolling = false;
      session.inference = null;
    }
  }
  return {
    locked: manual ?? locked,
    error,
    progress,
    phase,
    enrollingPlayerId,
    enrolling,
    enroll,
  };
}
