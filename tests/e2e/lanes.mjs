import { chromium } from "playwright-core";
import fs from "node:fs";
const [ROOT, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 }, acceptDownloads: true })).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", (d) => d.accept("Família ampliada"));
await page.goto(`file://${ROOT}/dist/index.html`); await page.waitForSelector(".node");
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const r = {};
try {
  let w = await ws();
  r.inferred = Object.fromEntries(["identidade", "preconsulta", "chamada-medico", "totem-12"].map((id) => [id, w.scenes.find((s) => s.id === id).lane]));
  r.lanesCatalog = w.lanes.map((l) => l.id).join(",");
  await page.click('[data-focus-scene="preconsulta"]'); // cena selecionada
  const L = () => w.graph.layouts["lanes|scene:preconsulta"];
  const evK = "event:" + w.events.find((e) => e.sceneId === "preconsulta").id;
  w = await ws(); const y0 = L()[evK].y;
  r.gutter = await page.$$eval(".lane-label b", (b) => b.map((x) => x.textContent));
  // muda a raia da cena → eventos vão para a nova faixa (recorte reorganizado)
  await page.selectOption('[data-field="lane"]', "medico");
  w = await ws();
  r.laneChanged = { scene: w.scenes.find((s) => s.id === "preconsulta").lane, gutter: await page.$$eval(".lane-label b", (b) => b.map((x) => x.textContent)) };
  // no capítulo, Enfermagem perdeu 1 evento e Médico ganhou
  await page.click('[data-focus-chapter="consulta"]'); await page.keyboard.press("Escape");
  r.chapterGutter = await page.$$eval(".lane-label", (ls) => ls.map((l) => l.getAttribute("title")));
  // Ctrl+Z volta a raia
  await page.keyboard.press("Meta+z");
  w = await ws(); r.undoLane = w.scenes.find((s) => s.id === "preconsulta").lane;
  // Tab num evento (modo raias): novo evento na mesma faixa
  await page.click('[data-tab="inventory"]'); await page.fill("#search", w.events.find((e) => e.sceneId === "preconsulta").name);
  await page.click('.inventory-item[data-select-node^="event:"]');
  await page.keyboard.press("Tab"); await page.keyboard.type("Pulseira conferida"); await page.keyboard.press("Enter");
  w = await ws();
  const nk = "event:" + w.events.find((e) => e.name === "Pulseira conferida").id;
  const S = w.graph.layouts["lanes|scene:preconsulta"];
  r.tabSameLane = S[nk].y === S[evK].y;
  // Enter na cena: nova cena herda a raia
  await page.click('[data-tab="journey"]'); await page.click('[data-focus-scene="preconsulta"]');
  await page.keyboard.press("Enter"); await page.keyboard.type("Pulseira impressa"); await page.keyboard.press("Enter");
  w = await ws(); r.siblingLane = w.scenes.find((s) => s.title === "Pulseira impressa")?.lane;
  // cadastrar raia nova (prompt → "Família ampliada")
  await page.click('[data-focus-scene="preconsulta"]');
  await page.click('[data-add-choice="lane"]');
  w = await ws();
  r.customLane = { order: w.lanes.map((l) => l.label).slice(-2), scene: w.lanes.find((l) => l.id === w.scenes.find((s) => s.id === "preconsulta").lane)?.label };
  // desligar raias → eventos numa linha (outra chave de posições)
  await page.click("#lanesBtn");
  r.lanesOff = { gutterHidden: await page.$eval("#laneGutter", (g) => g.hidden), pressed: await page.getAttribute("#lanesBtn", "aria-pressed") };
  await page.click("#lanesBtn");
  // camadas: botão desabilitado e sem rótulos
  await page.click('[data-layout="layers"]');
  r.layers = { disabled: await page.isDisabled("#lanesBtn"), gutterHidden: await page.$eval("#laneGutter", (g) => g.hidden) };
  await page.click('[data-layout="timeline"]');
  // SVG com raias
  await page.click('[data-focus-chapter="consulta"]');
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#svgBtn")]);
  r.svgLanes = fs.readFileSync(await dl.path(), "utf8").includes(">Médico</text>");
  // zoom e rótulo compacto
  await page.click("#zoomIn"); await page.click("#zoomIn"); await page.click("#zoomIn");
  r.zoom = await page.textContent("#zoomLabel");
  r.compactAtLowZoom = await page.$$eval(".lane-label", (ls) => ls.map((l) => l.classList.contains("compact")));
  await page.screenshot({ path: `${SHOTS}/lanes-2.png` });
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(JSON.stringify(r, null, 1), "\nerrors:", errors);
await browser.close();
