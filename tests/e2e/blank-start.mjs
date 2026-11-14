// Primeira abertura sem nada salvo: o canvas nasce limpo, sem mapa de exemplo, e continua limpo no reload.
import { chromium } from "playwright-core";
import { appUrl, watchCspViolations } from "./target.mjs";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("dialog", (d) => { errors.push("dialog inesperado: " + d.message()); d.dismiss(); });
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const snapshot = async () => ({
  cards: await page.locator("#nodes .node").count(),
  emptyVisible: await page.locator("#emptyStage").isVisible(),
  title: await page.textContent("#workspaceTitle"),
});
const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
try {
  await watchCspViolations(page);
  await page.goto(appUrl());
  await page.waitForSelector("#emptyStage:not([hidden])", { timeout: 5000 });
  r.first = await snapshot();
  const saved = await ws();
  r.saved = saved && ["journeys", "chapters", "scenes", "events", "decisions"].map((name) => saved[name].length);
  if (r.first.cards || !r.first.emptyVisible) fail(`a primeira abertura deveria mostrar o canvas vazio: ${JSON.stringify(r.first)}`);
  if (r.first.title !== "Mapa sem título") fail(`o mapa novo deveria se chamar "Mapa sem título": ${r.first.title}`);
  if (!r.saved || r.saved.some((count) => count !== 0)) fail(`o mapa salvo deveria nascer vazio: ${JSON.stringify(r.saved)}`);

  await page.reload();
  await page.waitForSelector("#emptyStage:not([hidden])", { timeout: 5000 });
  r.afterReload = await snapshot();
  if (r.afterReload.cards || !r.afterReload.emptyVisible) fail(`recarregar deveria manter o canvas vazio: ${JSON.stringify(r.afterReload)}`);
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(r, "\nerrors:", errors);
await browser.close();
