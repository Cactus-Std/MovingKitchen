import { useEffect, useRef, useState, type RefObject } from "react";
import { FACE_MODEL, type IdentityCandidate } from "@kitchen/shared";
import { MediaPipeOnnxFaceRecognitionProvider } from "./vision/MediaPipeOnnxFaceRecognitionProvider";
import { PredictionStabilizer } from "./vision/predictionStabilizer";
import { command, presence, roomMeta } from "./network";
export function useIdentity(
  video: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  roster: IdentityCandidate[],
  manual: string | null,
  sessionId: string | null,
) {
  const [locked, setLocked] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [progress, setProgress] = useState<number | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const candidates = useRef(roster);
  candidates.current = roster;
  const enrollment = useRef<MediaPipeOnnxFaceRecognitionProvider | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      enrollment.current?.dispose();
    };
  }, []);
  useEffect(() => {
    setLocked(null);
    setError(null);
    enrollment.current?.dispose();
  }, [sessionId]);
  useEffect(() => {
    if (!manual || !sessionId) return;
    setError(null);
    setLocked(manual);
    void presence(manual, "manual-debug").catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (!document.hidden)
        void presence(manual, "lock-heartbeat").catch((e) =>
          setError(e.message),
        );
    }, 1000);
    return () => clearInterval(timer);
  }, [manual, sessionId]);
  useEffect(() => {
    if (!enabled || manual || enrolling || !sessionId) return;
    setError(null);
    const provider = new MediaPipeOnnxFaceRecognitionProvider(),
      stabilizer = new PredictionStabilizer();
    let cancelled = false;
    let timeout = 0;
    let lastPositive = 0,
      lastHeartbeat = 0;
    const run = async () => {
      if (cancelled) return;
      try {
        const v = video.current;
        if (
          v &&
          v.readyState >= 2 &&
          !document.hidden &&
          candidates.current.length
        ) {
          const match = await provider.identify(
            v,
            candidates.current.map((c) => ({
              playerId: c.playerId,
              embedding: c.template.vector,
            })),
          );
          if (cancelled) return;
          const stable = stabilizer.update(match?.playerId ?? null);
          setLocked(stable.playerId);
          const now = performance.now();
          if (
            stable.playerId &&
            match?.playerId === stable.playerId &&
            (stable.changed || now - lastPositive >= 1000)
          ) {
            lastPositive = now;
            lastHeartbeat = now;
            await presence(stable.playerId, "positive-match", match.similarity);
          } else if (stable.playerId && now - lastHeartbeat >= 1000) {
            lastHeartbeat = now;
            await presence(stable.playerId, "lock-heartbeat");
          }
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "身份识别失败，请重试。");
      }
      if (!cancelled) timeout = window.setTimeout(run, 250);
    };
    void provider
      .initialize()
      .then(() => {
        if (cancelled) provider.dispose();
        else void run();
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
        provider.dispose();
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      provider.dispose();
    };
  }, [enabled, manual, enrolling, sessionId, video]);
  useEffect(() => {
    if (!enabled && !manual) {
      setLocked(null);
      void presence(null, "cleared").catch((error) => setError(error.message));
    }
  }, [enabled, manual]);
  async function enroll(playerId: string) {
    if (!video.current || video.current.readyState < 2) {
      setError("请先开启摄像头，等待画面出现。");
      return;
    }
    setEnrolling(true);
    setProgress(0);
    setError(null);
    const provider = new MediaPipeOnnxFaceRecognitionProvider();
    enrollment.current = provider;
    try {
      await provider.initialize();
      if (!active.current) return;
      const vector = await provider.enroll(video.current, (p) => {
        if (active.current) setProgress(p);
      });
      if (active.current)
        await command("player:enroll", {
          ...roomMeta(),
          playerId,
          template: { ...FACE_MODEL, vector },
        });
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : "录脸失败。");
    } finally {
      provider.dispose();
      enrollment.current = null;
      if (active.current) {
        setEnrolling(false);
        setProgress(null);
      }
    }
  }
  return { locked: manual ?? locked, error, progress, enrolling, enroll };
}
