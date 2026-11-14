// Story 36 (#17): texto com marcação vira texto; um board envenenado não carrega; nada executa sob a CSP.
import { chromium } from "playwright-core";
import { openTelos, telosUrl } from "../target.mjs";

const PAYLOAD = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
const xssCount = () => page.evaluate(() => window.__xss);
const injectedImages = () => page.locator("#app img").count();
const seedBoard = (board) =>
  page.evaluate((doc) => {
    localStorage.setItem(`telos:board:${doc.id}`, JSON.stringify(doc));
    const index = JSON.parse(localStorage.getItem("telos:boards") ?? "[]");
    localStorage.setItem("telos:boards", JSON.stringify([{ id: doc.id, title: String(doc.title), updatedAt: new Date().toISOString() }, ...index]));
  }, board);

try {
  await openTelos(page);
  await page.getByRole("button", { name: "Novo canvas" }).click();
  await page.waitForSelector(".wall");
  await page.mouse.move(500, 300);
  await page.keyboard.press("1");
  await page.keyboard.type(PAYLOAD);
  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForSelector(".sticky");
  r.typed = { text: await page.locator(".sticky-text").textContent(), images: await injectedImages(), xss: await xssCount() };
  if (r.typed.text !== PAYLOAD || r.typed.images || r.typed.xss !== undefined) fail(`o texto digitado deveria aparecer como texto: ${JSON.stringify(r.typed)}`);

  const titled = { schema: "telos/v1", id: "titulo-envenenado", title: PAYLOAD, stickies: [] };
  await seedBoard(titled);
  await page.goto(telosUrl("#/"));
  await page.waitForSelector(".board-list");
  r.homeTitle = await page.locator(".board-title").first().textContent();
  await page.goto(telosUrl(`#/canvas/${titled.id}`));
  await page.waitForSelector(".wall");
  r.barTitle = await page.locator(".canvas-title").textContent();
  if (r.homeTitle !== PAYLOAD || r.barTitle !== PAYLOAD) fail(`o título deveria aparecer como texto: ${JSON.stringify({ home: r.homeTitle, bar: r.barTitle })}`);

  const poisoned = {
    schema: "telos/v1",
    id: "x-envenenado",
    title: "Envenenado",
    stickies: [{ id: "s", kind: "domainEvent", text: "ok", x: `1px">${PAYLOAD}`, y: 0, w: 200, h: 120 }],
  };
  await seedBoard(poisoned);
  await page.goto(telosUrl(`#/canvas/${poisoned.id}`));
  await page.waitForSelector(".home");
  r.poisoned = { hash: new URL(page.url()).hash, images: await injectedImages(), xss: await xssCount() };
  if (r.poisoned.hash !== "#/" || r.poisoned.images || r.poisoned.xss !== undefined) fail(`o board envenenado não deveria carregar: ${JSON.stringify(r.poisoned)}`);
} catch (err) {
  r.FAILED = err.message.split("\n")[0];
}
console.log(r, "\nerrors:", errors);
await browser.close();
