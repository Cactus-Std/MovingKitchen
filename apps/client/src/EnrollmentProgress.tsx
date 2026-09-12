import type { EnrollmentPhase } from "./useIdentity";
import { ENROLLMENT_SAMPLE_COUNT } from "./vision/config";

export function EnrollmentProgress({
  phase,
  progress,
}: {
  phase: EnrollmentPhase;
  progress: number | null;
}) {
  if (phase === "idle") return null;
  const value = progress ?? 0;
  const label =
    phase === "loading"
      ? "正在加载本地识别模型…"
      : phase === "sampling"
        ? `采集样本 ${Math.round(value * ENROLLMENT_SAMPLE_COUNT)}/${ENROLLMENT_SAMPLE_COUNT} · ${Math.round(value * 100)}%`
        : phase === "saving"
          ? "样本采集完成，正在保存…"
          : phase === "complete"
            ? "人脸录入完成 ✓"
            : "录入未完成，请重试";
  return (
    <div className={`enrollment-progress ${phase}`}>
      <div role="status">{label}</div>
      <progress
        aria-label="人脸录入进度"
        max={1}
        value={phase === "loading" ? undefined : value}
      />
      {phase === "sampling" && (
        <small>请保持一张清晰、正对摄像头的人脸。</small>
      )}
    </div>
  );
}
