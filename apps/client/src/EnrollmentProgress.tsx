import type { EnrollmentPhase } from "./useIdentity";
import { ENROLLMENT_SAMPLE_COUNT } from "./vision/config";
import { text, type Language } from "./i18n";

export function EnrollmentProgress({
  phase,
  progress,
  language = "zh",
}: {
  phase: EnrollmentPhase;
  progress: number | null;
  language?: Language;
}) {
  if (phase === "idle") return null;
  const value = progress ?? 0;
  const label =
    phase === "loading"
      ? text(
          language,
          "Loading the local recognition model…",
          "正在加载本地识别模型…",
        )
      : phase === "sampling"
        ? text(
            language,
            `Collecting samples ${Math.round(value * ENROLLMENT_SAMPLE_COUNT)}/${ENROLLMENT_SAMPLE_COUNT} · ${Math.round(value * 100)}%`,
            `采集样本 ${Math.round(value * ENROLLMENT_SAMPLE_COUNT)}/${ENROLLMENT_SAMPLE_COUNT} · ${Math.round(value * 100)}%`,
          )
        : phase === "saving"
          ? text(
              language,
              "Samples collected. Saving…",
              "样本采集完成，正在保存…",
            )
          : phase === "complete"
            ? text(language, "Face enrolled ✓", "人脸录入完成 ✓")
            : text(
                language,
                "Enrollment incomplete. Please try again.",
                "录入未完成，请重试",
              );
  return (
    <div className={`enrollment-progress ${phase}`}>
      <div role="status">{label}</div>
      <progress
        aria-label={text(language, "Face enrollment progress", "人脸录入进度")}
        max={1}
        value={phase === "loading" ? undefined : value}
      />
      {phase === "sampling" && (
        <small>
          {text(
            language,
            "Keep one clear face looking directly at the camera.",
            "请保持一张清晰、正对摄像头的人脸。",
          )}
        </small>
      )}
    </div>
  );
}
