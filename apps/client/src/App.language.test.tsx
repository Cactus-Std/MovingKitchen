// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("./network", () => ({
  clearError: vi.fn(),
  command: vi.fn(),
  createRoom: vi.fn(),
  deviceId: "test-device",
  forgetRoom: vi.fn(),
  joinRoom: vi.fn(),
  kitchenAction: vi.fn(),
  leaveRoom: vi.fn(),
  presence: vi.fn(),
  roomMeta: vi.fn(),
  socket: { connect: vi.fn(), disconnect: vi.fn() },
  useNetwork: () => ({
    room: null,
    roster: [],
    connected: true,
    ready: false,
    error: null,
  }),
}));

vi.mock("./useIdentity", () => ({
  useIdentity: () => ({
    locked: null,
    error: null,
    progress: null,
    phase: "idle",
    enrollingPlayerId: null,
    enrolling: false,
    enroll: vi.fn(),
  }),
}));

vi.mock("./input/useKitchenInput", () => ({
  useKitchenInput: () => ({
    videoRef: { current: null },
    status: "idle",
    error: null,
    hands: [],
    loadingStep: "permission",
    retry: vi.fn(),
    view: {
      cursor: null,
      progress: 0,
      rotationRad: null,
      feedback: "",
    },
    feedback: null,
    resetTracking: vi.fn(),
    debugTarget: vi.fn(),
    debugAction: vi.fn(),
    debugPose: vi.fn(),
    debugLeave: vi.fn(),
  }),
}));

import { App } from "./App";

const play = vi
  .spyOn(window.HTMLMediaElement.prototype, "play")
  .mockResolvedValue();
const pause = vi
  .spyOn(window.HTMLMediaElement.prototype, "pause")
  .mockImplementation(() => {});

beforeEach(() => {
  play.mockClear();
  pause.mockClear();
});

afterEach(cleanup);

it("opens in English and switches the complete pre-game UI to Chinese", () => {
  render(<App />);

  expect(screen.getByRole("button", { name: /Create kitchen/ })).toBeTruthy();
  expect(screen.getByLabelText("Kitchen code")).toBeTruthy();
  expect(document.documentElement.lang).toBe("en");
  expect(document.title).toBe("Moving Kitchen · Cook together");

  fireEvent.click(screen.getByRole("button", { name: "中文" }));

  expect(screen.getByRole("button", { name: /创建厨房/ })).toBeTruthy();
  expect(screen.getByLabelText("房间码")).toBeTruthy();
  expect(document.documentElement.lang).toBe("zh-CN");
  expect(document.title).toBe("Moving Kitchen · 一起开饭");
});

it("starts looping background music by default and exposes a bilingual toggle", () => {
  render(<App />);

  const audio = document.querySelector("audio");
  expect(audio?.getAttribute("src")).toBe("/assets/audio/arcade-groove.mp3");
  expect(audio?.loop).toBe(true);
  expect(play).toHaveBeenCalledOnce();

  fireEvent.click(
    screen.getByRole("button", { name: "Turn off background music" }),
  );
  expect(pause).toHaveBeenCalledOnce();
  expect(
    screen.getByRole("button", { name: "Turn on background music" }),
  ).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "中文" }));
  expect(screen.getByRole("button", { name: "开启背景音乐" })).toBeTruthy();
});
