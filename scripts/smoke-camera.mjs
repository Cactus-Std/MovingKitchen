import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const context = await browser.newContext({ permissions: ["camera"] });
  const page = await context.newPage();
  const loaded = new Set();
  const errors = [];
  page.on("response", (response) => {
    if (response.status() === 200) loaded.add(new URL(response.url()).pathname);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
  await page.goto(process.env.KITCHEN_TEST_URL ?? "http://localhost:5180");
  await page.getByRole("button", { name: /Create kitchen/ }).click();
  await page
    .getByRole("button", { name: "Turn on camera", exact: true })
    .click();
  await page.waitForFunction(
    () => {
      const video = document.querySelector("video");
      return (
        video?.readyState >= 2 && !document.querySelector(".camera-loading")
      );
    },
    null,
    { timeout: 60000 },
  );
  await page.waitForTimeout(2500);
  assert(
    loaded.has("/models/hand_landmarker.task"),
    "Hand model must load locally",
  );
  assert(
    loaded.has("/models/facex_tiny.enc"),
    "Face recognition model must load locally",
  );
  assert(
    [...loaded].some(
      (path) => path.startsWith("/models/wasm/") && path.endsWith(".wasm"),
    ),
    "Matching hand WASM",
  );
  assert(
    [...loaded].some(
      (path) => path.startsWith("/mediapipe/") && path.endsWith(".wasm"),
    ),
    "Matching face WASM",
  );
  assert(
    [...loaded].some(
      (path) => path.startsWith("/onnxruntime/") && path.endsWith(".wasm"),
    ),
    "Local ONNX runtime",
  );
  assert.deepEqual(
    await page.getByRole("alert").allTextContents(),
    [],
    "Model initialization must not show a hidden failure",
  );
  const tracks = await page.evaluate(() => {
    const video = document.querySelector("video");
    window.testCameraTracks = video.srcObject.getVideoTracks();
    return window.testCameraTracks.length;
  });
  assert.equal(tracks, 1);
  await page.getByRole("textbox", { name: "Chef name" }).fill("Camera test");
  await page.getByRole("button", { name: "+ Add chef" }).click();
  await page
    .getByRole("button", {
      name: "Consent and enroll the selected chef's face",
    })
    .click();
  await page
    .getByRole("progressbar", { name: "Face enrollment progress" })
    .waitFor();
  if (process.env.KITCHEN_TEST_OUTPUT) {
    await mkdir(process.env.KITCHEN_TEST_OUTPUT, { recursive: true });
    await page.screenshot({
      path: resolve(process.env.KITCHEN_TEST_OUTPUT, "enrollment-progress.png"),
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.getByRole("button", { name: "Exit", exact: true }).click();
  await page.waitForFunction(() =>
    window.testCameraTracks.every((track) => track.readyState === "ended"),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: shared video, local hand+face models, separate matching WASM, camera stop releases track. Synthetic camera only; human recognition requires on-site acceptance.",
  );
} finally {
  await browser.close();
}
