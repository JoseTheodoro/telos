// Escolher "Não definido" como pai remove a seta de contenção, sem deixar seta com origem vazia.
import { chromium } from "playwright-core";
import { appUrl } from "./target.mjs";

const CHAPTER = "chapter:consulta";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("dialog", (d) => d.accept());
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const containmentOf = (w) => w.graph.edges.filter((e) => e.to === CHAPTER && e.from.startsWith("journey:") && e.label === "contém");
const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
try {
  await page.goto(appUrl()); await page.waitForSelector(".node");
  r.before = containmentOf(await ws()).map((e) => e.from);
  if (r.before.length !== 1) fail(`preparação: o capítulo deveria começar com uma seta contém da jornada (${r.before.length})`);

  await page.click('[data-tab="inventory"]');
  await page.fill("#search", "A consulta");
  await page.click(`.inventory-item[data-select-node="${CHAPTER}"]`);
  await page.selectOption('[data-field="journeyId"]', "");
  await page.waitForTimeout(300);

  const w = await ws();
  r.dangling = w.graph.edges.filter((e) => e.from.endsWith(":") || e.to.endsWith(":")).map((e) => `${e.from} → ${e.to}`);
  r.after = containmentOf(w).map((e) => e.from);
  r.journeyId = w.chapters.find((c) => c.id === CHAPTER.slice("chapter:".length))?.journeyId;
  if (r.dangling.length) fail(`"Não definido" criou seta com ponta vazia: ${r.dangling.join(", ")}`);
  if (r.after.length) fail(`a seta contém anterior deveria ter sido removida: ${r.after.join(", ")}`);
  if (r.journeyId !== "") fail(`o campo de jornada deveria ficar vazio: ${r.journeyId}`);
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(r, "\nerrors:", errors);
await browser.close();
