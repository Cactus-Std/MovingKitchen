import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { FACE_MODEL } from "@kitchen/shared";
import { io } from "socket.io-client";
const output = process.env.KITCHEN_TEST_OUTPUT;
if (output) await mkdir(output, { recursive: true });
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
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    permissions: ["camera"],
  });
  const errors = [];
  let serverUrl;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/socket.io/") serverUrl = url.origin;
  });
  page.on("pageerror", (error) => errors.push(error.message));
  // Inject only the face predictions. The application, hand camera and real server remain intact.
  await page.route(
    "**/src/vision/MediaPipeOnnxFaceRecognitionProvider.ts*",
    (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `export class MediaPipeOnnxFaceRecognitionProvider {
    async initialize(){} async identify(){ const id=window.testFacePlayer; return id?{playerId:id,similarity:0.95,secondBestPlayerId:null,secondBestSimilarity:null}:null; }
    async enroll(){return [];} dispose(){}
  }`,
      }),
  );
  await page.goto(process.env.KITCHEN_TEST_URL ?? "http://localhost:5180");
  assert.equal(
    await page.locator('script[src="/@vite/client"]').count(),
    1,
    "Identity fixture requires the Vite development frontend",
  );
  await page.getByRole("button", { name: "中文", exact: true }).click();
  assert.equal(
    await page.evaluate(() => document.documentElement.lang),
    "zh-CN",
    "The pre-game language switch must update the document language",
  );
  const state = () =>
    page.evaluate(() => JSON.parse(window.render_game_to_text()));
  const target = async (id) => {
    await page.locator(`[data-target="${id}"]`).click();
    await page.mouse.move(5, 80);
    await page.waitForTimeout(300);
  };
  const confirmed = async (name) =>
    page.waitForFunction((name) => {
      const s = JSON.parse(window.render_game_to_text());
      return s.control && s.player === name;
    }, name);
  const choose = async (name) => {
    await page
      .getByRole("button", { name: new RegExp("^" + name + "( · 接管)?$") })
      .click();
    await confirmed(name);
  };
  const shot = async (name) => {
    if (output)
      await page.screenshot({
        path: resolve(output, name + ".png"),
        animations: "disabled",
      });
  };
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /创建厨房/ }).click();
  await page.getByLabel("工位", { exact: true }).selectOption("storage-sink");
  for (const name of ["Alice", "Bob"]) {
    await page.getByRole("textbox", { name: "厨师名字" }).fill(name);
    await page.getByRole("button", { name: "＋ 添加厨师" }).click();
    await page.getByRole("button", { name: new RegExp(name) }).waitFor();
  }
  // Synthetic templates let the real server validate positive camera evidence.
  assert(serverUrl, "The browser must connect to a game server");
  const fixture = io(serverUrl, {
    transports: ["websocket"],
    forceNew: true,
    autoConnect: false,
  });
  const roomCode = (await state()).room,
    deviceId = crypto.randomUUID();
  const meta = () => ({
    protocolVersion: 1,
    requestId: crypto.randomUUID(),
    roomCode,
    deviceId,
  });
  let ids;
  try {
    await new Promise((resolve, reject) => {
      fixture.once("connect", resolve);
      fixture.once("connect_error", reject);
      fixture.connect();
    });
    const joined = await fixture.timeout(5000).emitWithAck("room:join", meta());
    assert(joined.ok);
    ids = joined.data.players.map((p) => p.id);
    for (const [i, playerId] of ids.entries()) {
      const ack = await fixture.timeout(5000).emitWithAck("player:enroll", {
        ...meta(),
        playerId,
        template: {
          ...FACE_MODEL,
          vector: Array.from({ length: 512 }, (_, j) => (j === i ? 1 : 0)),
        },
      });
      assert(ack.ok);
    }
    assert((await fixture.timeout(5000).emitWithAck("room:leave", meta())).ok);
  } finally {
    fixture.disconnect();
  }
  await page.getByRole("button", { name: "开饭！", exact: true }).click();
  await choose("Alice");
  await target("food-cheese");
  const cheese = (await state()).held.id;
  await choose("Bob");
  assert.equal((await state()).held, null);
  await target("food-dough");
  const dough = (await state()).held.id;
  await page.evaluate((id) => {
    window.testFacePlayer = id;
  }, ids[0]);
  await page.getByRole("button", { name: "开启摄像头", exact: true }).click();
  await confirmed("Alice");
  assert.equal((await state()).held.id, cheese);
  await page.evaluate(() => {
    window.testFacePlayer = null;
  });
  await page.waitForTimeout(1200);
  assert.equal((await state()).player, "Alice");
  assert.equal((await state()).held.id, cheese);
  await page.waitForFunction(
    () => JSON.parse(window.render_game_to_text()).identityAbsent,
    null,
    { timeout: 5000 },
  );
  assert.equal((await state()).held, null);
  assert.equal((await state()).control, false);
  assert.equal((await state()).kitchen.items[cheese].heldBy, ids[0]);
  await shot("no-player");
  await page.waitForTimeout(1000);
  assert.equal(
    (await state()).player,
    undefined,
    "No default identity after expiry",
  );
  await page.evaluate((id) => {
    window.testFacePlayer = id;
  }, ids[0]);
  await confirmed("Alice");
  assert.equal((await state()).held.id, cheese);
  await shot("alice-returned");
  await page.evaluate((id) => {
    window.testFacePlayer = id;
  }, ids[1]);
  await confirmed("Bob");
  assert.equal((await state()).held.id, dough);
  await shot("bob-own-item");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real UI/server with injected face predictions; grace period, vacancy, reacquisition, and distinct player inventories.",
  );
} finally {
  await browser.close();
}
