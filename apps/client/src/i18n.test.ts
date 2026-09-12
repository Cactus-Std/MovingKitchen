import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANGUAGE,
  commandErrorText,
  runtimeErrorText,
  text,
} from "./i18n";
import { getItemLabels, getStationLabels } from "./gameView";

describe("bilingual UI copy", () => {
  it("defaults to English and exposes translated game labels", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(getItemLabels(DEFAULT_LANGUAGE).tomato).toBe("Tomato");
    expect(getStationLabels(DEFAULT_LANGUAGE)["storage-sink"]).toBe(
      "Storage & sink",
    );
    expect(text("zh", "Tomato", "番茄")).toBe("番茄");
  });

  it("localizes server errors instead of leaking Chinese into English UI", () => {
    expect(commandErrorText("en", "ROOM_NOT_FOUND", "房间不存在")).toBe(
      "Kitchen not found. The server may have restarted.",
    );
    expect(commandErrorText("zh", "ROOM_NOT_FOUND", "房间不存在")).toBe(
      "房间不存在",
    );
    expect(runtimeErrorText("zh", "operation has timed out")).toBe(
      "厨房响应超时，请重试。",
    );
  });
});
