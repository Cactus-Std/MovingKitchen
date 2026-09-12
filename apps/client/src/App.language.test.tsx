// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RoomState } from "@kitchen/shared";
import { newKitchen, applyKitchenAction } from "../../server/src/kitchen";

const network = vi.hoisted(() => ({ room: null as RoomState | null }));

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
    room: network.room,
    roster: [],
    connected: true,
    ready: !!network.room,
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

beforeEach(() => {
  network.room = null;
  window.history.replaceState({}, "", "/");
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
afterEach(cleanup);

function kitchenRoom() {
  const room: RoomState = {
    code: "TEST",
    hostDeviceId: "test-device",
    players: [],
    connectedDeviceIds: ["test-device"],
    stationByDevice: { "test-device": "oven-pass" },
    presenceByDevice: {},
    controlLeaseByPlayer: {},
    kitchen: newKitchen(),
    createdAt: 0,
    debugMode: true,
  };
  network.room = room;
  return room;
}

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

it("connects the new results scene to the real game outcome and host actions", () => {
  const room = kitchenRoom();
  room.kitchen.status = "lobby";
  const view = render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "中文" }));
  room.kitchen.status = "finished";
  room.kitchen.finishedReason = "served";
  room.kitchen.score = 1742;
  view.rerender(<App />);

  expect(screen.getByRole("dialog", { name: "开饭啦！" })).toBeTruthy();
  expect(
    view.container.querySelector(".result-art img")?.getAttribute("src"),
  ).toBe("/assets/tools/pizza4.png");
  expect(screen.getByText("1742")).toBeTruthy();
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "再开一单" })
      .disabled,
  ).toBe(false);
  room.hostDeviceId = "other-device";
  view.rerender(<App />);
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "等待房主重开" })
      .disabled,
  ).toBe(true);
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "离开厨房" })
      .disabled,
  ).toBe(false);
});

it.each([
  ["burnt", "The pizza burned"],
  ["timeout", "Time's up"],
] as const)(
  "shows the %s outcome without a successful pizza",
  (reason, title) => {
    const room = kitchenRoom();
    room.kitchen.status = "finished";
    room.kitchen.finishedReason = reason;
    const view = render(<App />);
    expect(screen.getByRole("dialog", { name: title })).toBeTruthy();
    expect(view.container.querySelector(".result-art img")).toBeNull();
  },
);

it("shows baking stages and moves the cooked pizza to the tray", () => {
  const room = kitchenRoom();
  const k = room.kitchen;
  k.status = "playing";
  const view = render(<App />);
  expect(view.container.querySelector(".oven-pizza")).toBeNull();
  for (const [progress, stage] of [
    [0, 1],
    [34, 2],
    [67, 3],
    [100, 4],
  ]) {
    k.oven.status = progress === 100 ? "ready" : "baking";
    k.oven.cookProgress = progress;
    view.rerender(<App />);
    expect(
      view.container
        .querySelector(".oven-pizza img.visible")
        ?.getAttribute("src"),
    ).toBe(`/assets/tools/pizza${stage}.png`);
    expect(
      screen
        .getByRole("progressbar", { name: "Baking progress" })
        .getAttribute("aria-valuenow"),
    ).toBe(String(progress));
  }
  applyKitchenAction(
    k,
    "chef",
    "oven-pass",
    { type: "PICKUP_ITEM", itemId: "oven-pass:oven-mitt" },
    0,
  );
  applyKitchenAction(k, "chef", "oven-pass", { type: "TAKE_PIZZA" }, 0);
  const pizza = k.items[k.oven.pizzaItemId!];
  pizza.cutProgress = 40;
  view.rerender(<App />);
  expect(view.container.querySelector(".oven-pizza")).toBeNull();
  expect(
    view.container.querySelector(".target-pass img")?.getAttribute("src"),
  ).toBe("/assets/tools/pizza-plate.png");
  expect(
    screen
      .getByRole("progressbar", { name: "Slicing progress" })
      .getAttribute("aria-valuenow"),
  ).toBe("40");
  expect(screen.getByText("Slice the pizza · 2/5 cuts")).toBeTruthy();
});

it("shows stretching progress on the board and ignores the old temporary preview flag", () => {
  const room = kitchenRoom();
  room.stationByDevice["test-device"] = "board-1";
  room.kitchen.status = "playing";
  applyKitchenAction(
    room.kitchen,
    "chef",
    "storage-sink",
    { type: "PICKUP_STORAGE", ingredient: "dough" },
    0,
  );
  applyKitchenAction(
    room.kitchen,
    "chef",
    "board-1",
    { type: "PLACE_ITEM" },
    0,
  );
  applyKitchenAction(room.kitchen, "chef", "board-1", { type: "STRETCH" }, 0);
  window.history.replaceState({}, "", "/?resultPreview");
  const view = render(<App />);
  expect(
    screen
      .getByRole("progressbar", { name: "Stretching progress" })
      .getAttribute("aria-valuenow"),
  ).toBe("25");
  expect(view.container.querySelector(".result-preview-backdrop")).toBeNull();
});
