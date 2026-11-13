import { chromium } from "playwright-core";
import fs from "node:fs";
const [ROOT, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1540, height: 920 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", (d) => d.accept());
await page.goto(`file://${ROOT}/dist/index.html`); await page.waitForSelector(".node");
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const r = {};
try {
  r.defaultMode = await page.$eval("[data-layout].active", (b) => b.dataset.layout);
  await page.click('[data-focus-scene="preconsulta"]'); await page.keyboard.press("Escape");
  let w = await ws();
  const L = () => (w.graph.layouts["lanes|scene:preconsulta"] ?? w.graph.layouts["timeline|scene:preconsulta"]);
  // geometria vertical: capítulo → cena sai por baixo do capítulo
  const ch = L()["chapter:consulta"];
  const edgeCS = w.graph.edges.find((e) => e.from === "chapter:consulta" && e.to === "scene:preconsulta");
  r.verticalEdge = await page.$eval(`[data-edge="${edgeCS.id}"] .edge-line`, (p) => p.getAttribute("d").split(" C")[0]);
  r.expectedStart = `M ${ch.x + 121} ${ch.y + 94}`;
  // Tab num evento: insere à direita e empurra o seguinte
  const evs = w.events.filter((e) => e.sceneId === "preconsulta");
  const k0 = "event:" + evs[0].id, k1 = "event:" + evs[1].id;
  const before = { x0: L()[k0].x, x1: L()[k1].x, y: L()[k0].y };
  await page.click('[data-tab="inventory"]'); await page.fill("#search", evs[0].name); await page.click('.inventory-item[data-select-node^="event:"]');
  await page.keyboard.press("Tab"); await page.keyboard.type("Pulseira conferida"); await page.keyboard.press("Enter");
  w = await ws();
  const nk = "event:" + w.events.find((e) => e.name === "Pulseira conferida").id;
  r.tabInsert = { newX: L()[nk].x, newY: L()[nk].y, expectedX: before.x0 + 290, sameRow: L()[nk].y === before.y, nextPushed: L()[k1].x - before.x1 };
  // H no evento: hotspot acima
  await page.keyboard.press("h"); await page.keyboard.type("Quem coloca a pulseira?"); await page.keyboard.press("Enter");
  w = await ws();
  const hk = "hotspot:" + w.decisions.at(-1).id;
  r.hotspotAbove = L()[hk].y < L()[nk].y;
  // Enter numa cena (recorte de capítulo): nova cena depois dos eventos da cena de origem
  await page.click('[data-tab="journey"]'); await page.click('[data-focus-chapter="consulta"]'); await page.keyboard.press("Escape");
  w = await ws();
  const C = () => (w.graph.layouts["lanes|chapter:consulta"] ?? w.graph.layouts["timeline|chapter:consulta"]);
  const preEvents = w.events.filter((e) => e.sceneId === "preconsulta").map((e) => C()["event:" + e.id].x);
  const nextScene = w.scenes[w.scenes.findIndex((s) => s.id === "preconsulta") + 1];
  const nextSceneX = C()["scene:" + nextScene.id].x;
  await page.click('[data-focus-scene="preconsulta"]'); await page.click('[data-focus-chapter="consulta"]');
  await page.click('[data-tab="inventory"]'); await page.fill("#search", "A enfermagem acolhe"); await page.click('.inventory-item[data-select-node^="scene:"]');
  await page.click('[data-tab="journey"]');
  await page.click('[data-focus-chapter="consulta"]', { timeout: 5000 }).catch((err) => { throw new Error(`recorte do capítulo consulta indisponível na árvore: ${err.message}`); });
  r.scopeBeforeEnter = await page.inputValue("#sceneFilter");
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
// alternar modos preserva posições de cada um
try {
  await page.click('[data-tab="journey"]'); await page.click('[data-focus-scene="preconsulta"]'); await page.keyboard.press("Escape");
  let w = await ws();
  const tlBefore = JSON.stringify((w.graph.layouts["lanes|scene:preconsulta"] ?? w.graph.layouts["timeline|scene:preconsulta"]));
  await page.click('[data-layout="layers"]');
  r.layersMode = await page.$eval("[data-layout].active", (b) => b.dataset.layout);
  r.bandsInLayers = await page.locator(".chapter-band").count();
  await page.click('[data-layout="timeline"]');
  w = await ws();
  r.timelinePreserved = JSON.stringify((w.graph.layouts["lanes|scene:preconsulta"] ?? w.graph.layouts["timeline|scene:preconsulta"])) === tlBefore;
  r.layersStored = !!w.graph.layouts["scene:preconsulta"];
  // organizar
  await page.click("#layoutBtn"); r.organizeToast = await page.textContent("#toast");
  // SVG com faixas
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#svgBtn")]);
  const svg = fs.readFileSync(await dl.path(), "utf8");
  r.svgHasBand = svg.includes("02 · A consulta");
  // mapa existente em camadas abre em Camadas
  await page.click('[data-layout="layers"]');
  await page.evaluate(() => { const w = JSON.parse(localStorage.getItem("pep-atlas-studio-v4")); delete w.view.layoutMode; localStorage.setItem("pep-atlas-studio-v4", JSON.stringify(w)); });
  await page.reload(); await page.waitForSelector(".node");
  r.existingOpensLayers = await page.$eval("[data-layout].active", (b) => b.dataset.layout);
  // fit alinha à esquerda na jornada inteira (timeline)
  await page.click('[data-layout="timeline"]');
  await page.click('[data-focus-journey="jornada-exemplo"]'); await page.keyboard.press("Escape");
  const first = await page.locator('.node[data-kind="chapter"]').first().boundingBox();
  const stage = await page.locator("#stage").boundingBox();
  r.fitStartsLeft = first.x - stage.x < 200;
  await page.screenshot({ path: `${SHOTS}/tl-journey-fit.png` });
} catch (err) { r.FAILED2 = err.message.split("\n")[0]; }
console.log(r, "\nerrors:", errors);
await browser.close();
