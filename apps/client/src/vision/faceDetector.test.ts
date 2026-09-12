import { expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  resolve: null as null | ((value: { close: () => void }) => void),
  close: vi.fn(),
}));
vi.mock("@mediapipe/face-vision", () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  FaceDetector: {
    createFromOptions: () =>
      new Promise((resolve) => {
        fake.resolve = resolve;
      }),
  },
}));
import { MediaPipeFaceDetector } from "./faceDetector";
it("closes a model that finishes loading after its owner was disposed", async () => {
  const detector = new MediaPipeFaceDetector();
  const pending = detector.initialize();
  await vi.waitFor(() => expect(fake.resolve).not.toBeNull());
  detector.dispose();
  fake.resolve!({ close: fake.close });
  await pending;
  expect(fake.close).toHaveBeenCalledOnce();
});
