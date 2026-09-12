import {
  ACTIONS,
  type Frame,
  type Hand,
  type HitZone,
  type InputView,
  type KitchenEvent,
  type ToolId,
} from "./types";
import { measureMotion, motionSample, type MotionSample } from "./metrics";
import { text, type Language } from "../i18n";

export const DEFAULT_CONFIG = {
  grabMs: 180,
  releaseMs: 300,
  cooldownMs: 300,
  acquireMs: 150,
  reacquireMs: 350,
  travel: 0.055,
  cycleMs: 1800,
  pinchClose: 0.4,
  pinchOpen: 0.58,
  tilt: 0.5,
  circleSize: 0.08,
  circleMs: 2600,
};
type Config = typeof DEFAULT_CONFIG;
const initialView = (language: Language): InputView => ({
  held: null,
  hover: null,
  cursor: null,
  pose: "lost",
  progress: 0,
  hint: text(
    language,
    "Open your hand over a tool, then make a fist to pick it up",
    "张开手，移动到下方厨具，再握拳抓取",
  ),
});
const angleDelta = (a: number, b: number) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
const cursorPoint = (hand: Hand) => ({
  x: Math.max(0, Math.min(1, hand.palm.x)),
  y: Math.max(0, Math.min(1, hand.palm.y)),
});

export class KitchenRecognizer {
  view: InputView;
  private language: Language;
  private handId: string | null = null;
  private recoveryId: string | null = null;
  private recoverySince = 0;
  private lastPalm: Hand["palm"] | null = null;
  private lastFrame = -Infinity;
  private stableSince = 0;
  private openTarget: ToolId | null = null;
  private openSince = 0;
  private grabSince: number | null = null;
  private dropSince: number | null = null;
  private cooldownUntil = 0;
  private armed = false;
  private base = 0;
  private peak = 0;
  private secondBase = 0;
  private secondPeak = 0;
  private stage = 0;
  private began = 0;
  private samples: { x: number; y: number; t: number }[] = [];
  private motion: MotionSample[] = [];
  private config: Config;
  constructor(config: Partial<Config> = {}, language: Language = "zh") {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.language = language;
    this.view = initialView(language);
  }
  setLanguage(language: Language) {
    this.language = language;
  }

  reset() {
    this.view = initialView(this.language);
    this.handId = null;
    this.recoveryId = null;
    this.lastPalm = null;
    this.lastFrame = -Infinity;
    this.clearMotion();
  }
  private clearMotion() {
    this.armed = false;
    this.stage = 0;
    this.samples = [];
    this.motion = [];
    this.grabSince = null;
    this.dropSince = null;
    this.openTarget = null;
    this.openSince = 0;
    this.view.progress = 0;
  }
  suspend() {
    this.clearMotion();
    this.lastPalm = null;
    this.lastFrame = -Infinity;
    this.view.cursor = null;
    this.view.pose = "lost";
    this.view.hover = null;
    this.recoveryId = null;
  }

  debugGrab(tool: ToolId, time: number): KitchenEvent | null {
    if (this.view.held) return null;
    this.view.held = tool;
    this.clearMotion();
    this.cooldownUntil = time + this.config.cooldownMs;
    return { type: "grab", tool, source: "debug", detectedAt: time };
  }
  setHeldTool(tool: ToolId | null, time: number) {
    this.reset();
    this.view.held = tool;
    this.cooldownUntil = time + this.config.cooldownMs;
  }
  debugAction(time: number): KitchenEvent | null {
    if (!this.view.held || time < this.cooldownUntil) return null;
    this.cooldownUntil = time + this.config.cooldownMs;
    return {
      type: "action",
      tool: this.view.held,
      action: ACTIONS[this.view.held],
      source: "debug",
      detectedAt: time,
      metrics: null,
    };
  }
  release(time: number, source: "gesture" | "debug"): KitchenEvent | null {
    const tool = this.view.held;
    if (!tool) return null;
    this.view.held = null;
    this.clearMotion();
    this.cooldownUntil = time + this.config.cooldownMs;
    this.view.hint = text(
      this.language,
      "Released. Open your hand to choose another tool",
      "已放下。张开手选择下一件厨具",
    );
    return { type: "release", tool, source, detectedAt: time };
  }

  update(
    { time, hands }: Frame,
    zones: HitZone[],
    enabled = true,
  ): KitchenEvent[] {
    if (!enabled) {
      this.suspend();
      return [];
    }
    let hand = this.handId ? hands.find((h) => h.id === this.handId) : hands[0];
    if (!hand && !this.view.held) {
      hand = hands[0];
      this.handId = hand?.id ?? null;
    }
    if (!hand && hands.length) {
      const candidate = hands[0];
      if (this.recoveryId !== candidate.id) {
        this.recoveryId = candidate.id;
        this.recoverySince = time;
      }
      this.clearMotion();
      this.lastPalm = null;
      this.lastFrame = -Infinity;
      this.view.cursor = cursorPoint(candidate);
      this.view.pose = "moving";
      this.view.hover = null;
      this.view.hint = text(
        this.language,
        "Tracking this hand again; your item is still held",
        "正在重新跟随这只手，物品仍保留",
      );
      if (time - this.recoverySince < this.config.reacquireMs) return [];
      hand = candidate;
    }
    if (!hand) {
      this.suspend();
      this.view.hint = this.view.held
        ? text(
            this.language,
            "Your hand left the frame; your item is still held",
            "手暂时离开了画面，物品仍然保留",
          )
        : text(
            this.language,
            "Bring an open hand into view",
            "请把张开的手放进画面",
          );
      return [];
    }
    this.handId = hand.id;
    this.recoveryId = null;
    const discontinuity =
      time - this.lastFrame > 250 ||
      (this.lastPalm &&
        Math.hypot(
          hand.palm.x - this.lastPalm.x,
          hand.palm.y - this.lastPalm.y,
        ) > 0.3);
    if (discontinuity) {
      this.clearMotion();
      this.stableSince = time;
    }
    this.lastFrame = time;
    this.lastPalm = hand.palm;
    const zone =
      zones.find(
        (z) =>
          hand.palm.x >= z.x &&
          hand.palm.x <= z.x + z.width &&
          hand.palm.y >= z.y &&
          hand.palm.y <= z.y + z.height,
      )?.id ?? null;
    this.view.cursor = cursorPoint(hand);
    this.view.pose = hand.open ? "open" : hand.fist ? "fist" : "moving";
    this.view.hover = zone;
    if (
      time - this.stableSince < this.config.acquireMs ||
      time < this.cooldownUntil
    )
      return [];

    if (!this.view.held) {
      this.view.hint = text(
        this.language,
        "Aim at a tool with an open hand, then make a fist to pick it up",
        "张手瞄准厨具，再握拳抓取",
      );
      if (hand.open && zone && zone !== "drop") {
        if (this.openTarget !== zone) this.openSince = time;
        this.openTarget = zone;
        this.grabSince = null;
      } else if (
        hand.fist &&
        this.openTarget &&
        zone === this.openTarget &&
        time - this.openSince >= this.config.acquireMs
      ) {
        this.grabSince ??= time;
        this.view.progress = Math.min(
          1,
          (time - this.grabSince) / this.config.grabMs,
        );
        if (time - this.grabSince >= this.config.grabMs) {
          const tool = this.openTarget;
          this.view.held = tool;
          this.clearMotion();
          this.cooldownUntil = time + this.config.cooldownMs;
          return [{ type: "grab", tool, source: "gesture", detectedAt: time }];
        }
      } else if (!zone || zone !== this.openTarget) {
        this.openTarget = null;
        this.grabSince = null;
        this.view.progress = 0;
      } else {
        this.grabSince = null;
      }
      return [];
    }

    if (zone === "drop") {
      // Entering the release area cancels any unfinished action, including a pinch.
      this.stage = 0;
      this.armed = false;
      this.samples = [];
      this.motion = [];
      this.view.hint = text(
        this.language,
        "Open your hand in the drop zone and hold",
        "在放置区张开手，保持片刻",
      );
      if (hand.open) {
        this.dropSince ??= time;
        this.view.progress = Math.min(
          1,
          (time - this.dropSince) / this.config.releaseMs,
        );
        if (time - this.dropSince >= this.config.releaseMs)
          return [this.release(time, "gesture")!];
      } else {
        this.dropSince = null;
        this.view.progress = 0;
      }
      return [];
    }
    this.dropSince = null;
    this.view.progress = 0;
    let complete = false;
    const tool = this.view.held;
    const measured = motionSample(tool, hand, hands, time);
    if (measured)
      this.motion = [...this.motion, measured].filter(
        (sample) => time - sample.time <= this.config.circleMs,
      );
    else this.motion = [];
    if (tool === "knife" || tool === "dough") {
      this.view.hint =
        tool === "knife"
          ? text(
              this.language,
              "Move down to chop, then lift back up",
              "手向下切，再抬回原位",
            )
          : text(
              this.language,
              "Keep both hands open, press down together, then lift",
              "双手张开，一起下压再抬起",
            );
      const other = hands.find((h) => h.id !== hand.id);
      if (
        tool === "dough" &&
        (!hand.open ||
          !other?.open ||
          Math.abs(hand.palm.y - other.palm.y) > 0.16)
      ) {
        this.armed = false;
        this.stage = 0;
        this.motion = [];
        this.view.hint = text(
          this.language,
          "Put two open hands side by side in the camera view",
          "揉面需要两只张开的手并排入镜",
        );
        return [];
      }
      const y = hand.palm.y;
      const secondY = tool === "dough" ? other!.palm.y : y;
      if (!this.armed || time - this.began > this.config.cycleMs) {
        this.base = y;
        this.peak = y;
        this.secondBase = secondY;
        this.secondPeak = secondY;
        this.began = time;
        this.armed = true;
        this.stage = 0;
      }
      this.base = this.stage === 0 ? Math.min(this.base, y) : this.base;
      this.secondBase =
        this.stage === 0 ? Math.min(this.secondBase, secondY) : this.secondBase;
      if (
        y - this.base >= this.config.travel &&
        secondY - this.secondBase >= this.config.travel
      )
        this.stage = 1;
      if (this.stage) {
        this.peak = Math.max(this.peak, y);
        this.secondPeak = Math.max(this.secondPeak, secondY);
      }
      this.view.progress = this.stage
        ? 0.65
        : Math.min(0.5, ((y - this.base) / this.config.travel) * 0.5);
      complete =
        this.stage === 1 &&
        this.peak - y >= this.config.travel * 0.75 &&
        this.secondPeak - secondY >= this.config.travel * 0.75;
      if (this.stage)
        this.view.hint = text(
          this.language,
          "Good range — lift back up to complete the motion",
          "幅度已到位，抬回即可完成一次",
        );
    } else if (tool === "salt") {
      this.view.hint = text(
        this.language,
        "Pinch thumb and index finger, then open them to sprinkle",
        "拇指食指捏合，再打开撒下调料",
      );
      if (this.stage && time - this.began > this.config.cycleMs) this.stage = 0;
      if (
        hand.pinch < this.config.pinchClose &&
        !hand.fist &&
        this.stage === 0
      ) {
        this.stage = 1;
        this.began = time;
      }
      this.view.progress = this.stage ? 0.6 : 0;
      complete =
        this.stage === 1 &&
        hand.pinch > this.config.pinchOpen &&
        time - this.began >= 30;
      if (this.stage)
        this.view.hint = text(
          this.language,
          "Pinch detected — open your thumb and index finger",
          "捏合已识别，打开拇指与食指",
        );
    } else if (tool === "jug") {
      this.view.hint = text(
        this.language,
        "Start upright, tilt your wrist sideways, then return upright",
        "手腕竖直准备，向侧面倾斜，再回正",
      );
      if (!this.armed && Math.abs(hand.angle) < 0.4) {
        this.armed = true;
        this.base = hand.angle;
        this.began = time;
      }
      if (this.armed && time - this.began > this.config.circleMs) {
        this.armed = false;
        this.stage = 0;
      }
      if (
        this.armed &&
        Math.abs(angleDelta(hand.angle, this.base)) > this.config.tilt
      )
        this.stage = 1;
      this.view.progress = this.stage ? 0.65 : 0;
      complete =
        this.stage === 1 && Math.abs(angleDelta(hand.angle, this.base)) < 0.25;
      if (this.stage)
        this.view.hint = text(
          this.language,
          "Tilt detected — return your wrist upright",
          "倾斜已到位，手腕回正即可",
        );
    } else {
      this.view.hint = text(
        this.language,
        "Pretend to hold a spoon and draw a clear circle toward the camera",
        "像握着勺子，朝摄像头画一个清晰的圆",
      );
      this.samples.push({ ...hand.palm, t: time });
      this.samples = this.samples.filter(
        (p) => time - p.t <= this.config.circleMs,
      );
      // A completed loop may follow a straight transit from the tool shelf.
      // Test suffixes so that transit cannot distort the circle or its timing.
      for (let start = 0; start <= this.samples.length - 6; start++) {
        const samples = this.samples.slice(start);
        const xs = samples.map((p) => p.x),
          ys = samples.map((p) => p.y);
        const width = Math.max(...xs) - Math.min(...xs),
          height = Math.max(...ys) - Math.min(...ys);
        if (
          width <= this.config.circleSize ||
          height <= this.config.circleSize ||
          width / height <= 0.35 ||
          width / height >= 2.8
        )
          continue;
        const cx = (Math.max(...xs) + Math.min(...xs)) / 2,
          cy = (Math.max(...ys) + Math.min(...ys)) / 2;
        const angles = samples.map((p) => Math.atan2(p.y - cy, p.x - cx));
        const deltas = angles.slice(1).map((a, i) => angleDelta(a, angles[i]));
        const sweep = Math.abs(deltas.reduce((a, b) => a + b, 0));
        const total = deltas.reduce((a, b) => a + Math.abs(b), 0);
        const first = samples[0],
          last = samples[samples.length - 1];
        this.view.progress = Math.max(
          this.view.progress,
          Math.min(1, sweep / (Math.PI * 2)),
        );
        complete =
          sweep > Math.PI * 1.65 &&
          sweep / Math.max(total, 0.01) > 0.75 &&
          Math.hypot(first.x - last.x, first.y - last.y) <
            Math.min(width, height) * 0.5;
        if (complete) {
          this.motion = this.motion.filter((sample) => sample.time >= first.t);
          break;
        }
      }
    }
    if (!complete) return [];
    const metrics = measureMotion(tool, this.motion);
    this.clearMotion();
    this.cooldownUntil = time + this.config.cooldownMs;
    return [
      {
        type: "action",
        tool,
        action: ACTIONS[tool],
        source: "gesture",
        detectedAt: time,
        metrics,
      },
    ];
  }
}
