import { expect, it } from "vitest";
import { KitchenInputController } from "./KitchenInputController";
import type { InputContext, InteractionTarget } from "./contracts";
it("requires leaving the tool zone after returning a tool, including after host context changes", () => {
  const controller = new KitchenInputController();
  const tool = {
    id: "knife",
    kind: "tool" as const,
    label: "刀",
    tool: "knife" as const,
    homeSceneId: "board-1",
  };
  const context: InputContext = {
    contextId: "round",
    playerId: "p",
    sceneId: "board-1",
    held: tool,
    actionTarget: null,
    pending: false,
  };
  const target: InteractionTarget = {
    id: "tool",
    label: "归还",
    kind: "place",
    bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    allowed: true,
  };
  const frame = (time: number, x = 0.2) => ({
    time,
    hands: [
      {
        id: "h",
        palm: { x, y: 0.2 },
        angle: 0,
        open: true,
        fist: false,
        pinch: 0.8,
        points: [],
      },
    ],
  });
  let intent;
  for (let t = 0; t <= 400; t += 100)
    intent = controller.update(frame(t), context, [target], true);
  expect(intent?.type).toBe("place");
  const empty = { ...context, held: null };
  const pickup: InteractionTarget = { ...target, kind: "pickup", item: tool };
  controller.resetMotion();
  for (let t = 500; t <= 1600; t += 100)
    expect(controller.update(frame(t), empty, [pickup], true)).toBeNull();
  controller.update(frame(1700, 0.8), empty, [pickup], true);
  for (let t = 1800; t <= 2600; t += 100)
    intent = controller.update(frame(t), empty, [pickup], true);
  expect(intent?.type).toBe("pickup");
});
