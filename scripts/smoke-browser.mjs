import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const url = process.env.KITCHEN_TEST_URL ?? "http://localhost:5180";
const output = process.env.KITCHEN_TEST_OUTPUT;
if (output) await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const errors = [];
const pages = [];
const state = (page) =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
const shot = async (page, name) => {
  await page.mouse.move(5, 80);
  if (output)
    await page.screenshot({
      path: resolve(output, `${name}.png`),
      fullPage: true,
      animations: "disabled",
    });
};
const wait = async (page, predicate) => {
  await page.waitForFunction(predicate, null, { timeout: 15000 });
};
const click = async (page, locator) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    await locator.click();
    await page.mouse.move(5, 80);
    await page.waitForTimeout(250);
    if (
      !(await page.getByRole("alert").allTextContents()).some((text) =>
        text.includes("The kitchen changed"),
      )
    )
      return;
  }
  throw Error("Repeated revision conflicts");
};
const target = async (page, id) =>
  click(page, page.locator(`[data-target="${id}"]`));
const choose = async (page, name) => {
  await page
    .getByRole("button", { name: new RegExp(`^${name}( · Take control)?$`) })
    .click();
  await page.waitForFunction((name) => {
    const s = JSON.parse(window.render_game_to_text());
    return s.control && s.player === name;
  }, name);
};
try {
  for (let i = 0; i < 4; i++) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("favicon"))
        errors.push(msg.text());
    });
    await page.goto(url);
    await page.getByRole("button", { name: /Create kitchen/ }).waitFor();
    pages.push(page);
  }
  const [sink, board1, board2, oven] = pages;
  assert.equal(
    await sink.evaluate(() => document.documentElement.lang),
    "en",
    "English must be the default language",
  );
  await shot(sink, "home");
  assert.equal(
    await sink.getByLabel("Station", { exact: true }).count(),
    0,
    "No station assignment before joining",
  );
  await sink.getByRole("checkbox").check();
  await sink.getByRole("button", { name: /Create kitchen/ }).click();
  for (const name of ["Alice", "Bob", "Charlie", "Dana"]) {
    await sink.getByRole("textbox", { name: "Chef name" }).fill(name);
    await sink.getByRole("button", { name: "+ Add chef" }).click();
    await sink.getByRole("button", { name: new RegExp(name) }).waitFor();
  }
  const code = (await state(sink)).room;
  assert.equal((await state(sink)).station, undefined);
  await sink
    .getByLabel("Station", { exact: true })
    .selectOption("storage-sink");
  for (let i = 1; i < 4; i++) {
    await pages[i].getByRole("textbox", { name: "Kitchen code" }).fill(code);
    await pages[i].getByRole("button", { name: "Join", exact: true }).click();
    await pages[i].getByRole("heading", { name: "Chefs, assemble." }).waitFor();
    assert.equal((await state(pages[i])).station, undefined);
    await pages[i]
      .getByLabel("Station", { exact: true })
      .selectOption(["storage-sink", "board-1", "board-2", "oven-pass"][i]);
  }
  await shot(sink, "lobby");
  await sink
    .getByRole("button", { name: "Start cooking!", exact: true })
    .click();
  await Promise.all(
    pages.map((page, i) =>
      choose(page, ["Alice", "Bob", "Charlie", "Dana"][i]),
    ),
  );
  await Promise.all(
    pages.map((page, i) =>
      target(page, ["faucet", "tool-knife", "tool-knife", "tool-oven-mitt"][i]),
    ),
  );
  const parallel = await Promise.all(pages.map(state));
  assert(
    parallel.every((s) => s.control),
    "Every station must retain its own player control",
  );
  assert.equal(parallel[0].kitchen.faucetOn, true);
  assert.deepEqual(
    parallel.slice(1).map((s) => s.held?.kind),
    ["knife", "knife", "oven-mitt"],
  );
  await shot(board1, "parallel-stations");
  await Promise.all(
    pages.map((page, i) =>
      target(page, ["faucet", "tool-knife", "tool-knife", "tool-oven-mitt"][i]),
    ),
  );
  await choose(sink, "Alice");
  await target(sink, "food-cheese");
  const aliceItem = (await state(sink)).held.id;
  await choose(sink, "Bob");
  assert.equal(
    (await state(sink)).held,
    null,
    "Bob must not inherit Alice carry",
  );
  await target(sink, "food-dough");
  const bobItem = (await state(sink)).held.id;
  await choose(board1, "Alice");
  assert.equal((await state(board1)).held.id, aliceItem);
  assert.equal((await state(sink)).held.id, bobItem);
  await choose(board2, "Bob");
  await wait(sink, () => !JSON.parse(window.render_game_to_text()).control);
  assert.equal(
    (await state(sink)).held,
    null,
    "Old station must hide a transferred player carry",
  );
  assert.equal((await state(board2)).held.id, bobItem);
  await shot(board1, "alice-inventory");
  await shot(board2, "bob-inventory");
  await Promise.all([target(board1, "trash"), target(board2, "trash")]);
  await choose(sink, "Alice");
  await target(sink, "food-tomato");
  await wait(
    sink,
    () => JSON.parse(window.render_game_to_text()).held?.kind === "tomato",
  );
  const tomatoId = (await state(sink)).held.id;
  await target(sink, "work");
  await target(sink, "faucet");
  await shot(sink, "wash-start");
  const bounds = await sink.locator(".stage").boundingBox();
  for (let n = 0; n < 1000; n++) {
    const x = 0.73 + 0.205 * Math.sin(n * 0.12),
      y = 0.62 + 0.14 * Math.sin(n * 0.073);
    await sink.mouse.move(
      bounds.x + x * bounds.width,
      bounds.y + y * bounds.height,
    );
    await sink.waitForTimeout(40);
    if (n % 20 === 0) {
      const s = await state(sink);
      if (s.kitchen.items[tomatoId].cleanliness >= 92) break;
      if (n >= 980)
        throw Error(
          `Tomato did not wash: ${s.kitchen.items[tomatoId].cleanliness}%`,
        );
    }
  }
  await shot(sink, "wash-clean");
  await sink.waitForTimeout(250);
  // The same hover used to rotate can legitimately pick up a newly clean tomato.
  if ((await state(sink)).held?.id === tomatoId) await target(sink, "work");
  if ((await state(sink)).kitchen.faucetOn) await target(sink, "faucet");
  await target(sink, "work");
  assert.equal((await state(sink)).held.id, tomatoId);
  await choose(board1, "Alice");
  await wait(sink, () => !JSON.parse(window.render_game_to_text()).control);
  assert.equal((await state(board1)).held.id, tomatoId);
  await target(board1, "work");
  await target(board1, "tool-knife");
  for (let n = 0; n < 5; n++)
    await click(
      board1,
      board1.getByRole("button", { name: "Simulate one chop" }),
    );
  await shot(board1, "chopped");
  await target(board1, "tool-knife");
  await target(board1, "work");
  await choose(oven, "Alice");
  await target(oven, "oven");
  await choose(sink, "Bob");
  await target(sink, "food-sausage");
  assert.equal((await state(sink)).held?.kind, "sausage");
  await choose(board2, "Bob");
  await target(board2, "work");
  await target(board2, "tool-knife");
  for (let n = 0; n < 5; n++)
    await click(
      board2,
      board2.getByRole("button", { name: "Simulate one chop" }),
    );
  await target(board2, "tool-knife");
  await target(board2, "work");
  await choose(oven, "Bob");
  await target(oven, "oven");
  await choose(board1, "Alice");
  await target(board1, "tool-cloth");
  await click(board1, board1.getByRole("button", { name: "Simulate wipe" }));
  await target(board1, "tool-cloth");
  await choose(sink, "Alice");
  await target(sink, "food-dough");
  await choose(board1, "Alice");
  await target(board1, "work");
  for (let n = 0; n < 4; n++)
    await click(
      board1,
      board1.getByRole("button", { name: "Simulate two-hand stretch" }),
    );
  await wait(
    board1,
    () =>
      JSON.parse(window.render_game_to_text()).kitchen.items[
        JSON.parse(window.render_game_to_text()).kitchen.stations["board-1"]
          .occupiedItemId
      ]?.stretched,
  );
  await target(board1, "work");
  await choose(oven, "Alice");
  await target(oven, "oven");
  await choose(board2, "Bob");
  await target(board2, "tool-cloth");
  await click(board2, board2.getByRole("button", { name: "Simulate wipe" }));
  await target(board2, "tool-cloth");
  await choose(sink, "Bob");
  await target(sink, "food-cheese");
  await choose(board2, "Bob");
  await target(board2, "work");
  await target(board2, "tool-knife");
  for (let n = 0; n < 5; n++)
    await click(
      board2,
      board2.getByRole("button", { name: "Simulate one chop" }),
    );
  await target(board2, "tool-knife");
  await target(board2, "work");
  await choose(oven, "Bob");
  await target(oven, "oven");
  await shot(oven, "baking");
  await oven.reload();
  await wait(oven, () => JSON.parse(window.render_game_to_text()).ready);
  await choose(oven, "Bob");
  await target(oven, "tool-oven-mitt");
  await oven.waitForFunction(
    () =>
      JSON.parse(window.render_game_to_text()).kitchen.oven.status === "ready",
    null,
    { timeout: 25000 },
  );
  await target(oven, "oven");
  await target(oven, "tool-oven-mitt");
  await target(oven, "tool-pizza-cutter");
  await oven.getByRole("button", { name: "Simulate one chop" }).click();
  await oven.getByRole("heading", { name: "Order up!" }).waitFor();
  await shot(oven, "served");
  for (const page of pages) {
    const s = await state(page);
    assert.equal(s.kitchen.finishedReason, "served");
    assert(s.kitchen.score > 1000);
  }
  await sink.getByRole("button", { name: "Cook another" }).click();
  await wait(
    sink,
    () => JSON.parse(window.render_game_to_text()).mode === "playing",
  );
  assert.equal((await state(sink)).kitchen.waste.total, 0);
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await mobile.goto(url);
  await shot(mobile, "mobile-home");
  assert(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: four browser contexts, local 3D wash, roaming carry, two cutting boards, dough stretch, oven, slicing, reconnect, restart, mobile layout.",
  );
} catch (error) {
  for (let i = 0; i < pages.length; i++) {
    await shot(pages[i], `failure-${i}`);
    console.error(
      JSON.stringify({
        page: i,
        state: await state(pages[i]),
        alerts: await pages[i].getByRole("alert").allTextContents(),
      }),
    );
  }
  throw error;
} finally {
  await browser.close();
}
