// "Limpar canvas" apaga tudo o que está no canvas (hotspots, notas livres e molduras inclusive);
// ficam o caderno e as classificações personalizadas. Recarregar mantém o canvas vazio.
import { chromium } from "playwright-core";
import { openApp } from "./target.mjs";
const [, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1540, height: 920 } });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await openApp(page); await page.waitForSelector(".node");
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
const CANVAS = ["journeys", "chapters", "scenes", "events", "domains", "systems", "screens", "tables", "semanticNodes", "decisions", "canvasNotes", "frames"];
const KEPT = ["elementTypes", "natureOptions", "destinationOptions", "lanes"];
const counts = (w, names) => Object.fromEntries(names.map((n) => [n, (w[n] || []).length]));
const canvasCards = () => page.$$eval("#nodes > [data-node], #frameUi > [data-node]", (els) => els.length);

try {
  // Uma nota no caderno, uma nota livre e uma moldura, além do seed (que já tem hotspots).
  await page.click('[data-area="docs"]');
  await page.click(".docs-empty [data-doc-new]");
  await page.keyboard.type("Ata que fica");
  await page.keyboard.press("Enter");
  await page.keyboard.type("O caderno não é apagado pelo Limpar canvas.");
  await page.waitForTimeout(450); // o caderno grava 300 ms depois da última tecla
  await page.click('[data-area="canvas"]');
  await page.click('[data-focus-scene="preconsulta"]');
  await page.click("#quickNoteBtn");
  await page.keyboard.type("Nota que sai");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.click("#quickFrameBtn");
  await page.keyboard.type("Moldura que sai"); await page.keyboard.press("Enter");
  let w = await ws();
  const before = { canvas: counts(w, CANVAS), kept: counts(w, KEPT), docs: w.docs.length, edges: w.graph.edges.length };
  r.before = before;
  if (!before.canvas.decisions || !before.canvas.canvasNotes || !before.canvas.frames || !before.docs) fail("preparação: faltam hotspot, nota, moldura ou caderno");

  // Prévia: conta tudo, hotspots inclusive, e diz o que fica.
  await page.click("#clearCanvasBtn");
  const total = Object.values(before.canvas).reduce((a, b) => a + b, 0);
  r.preview = (await page.textContent(".wipe-preview")).replace(/\s+/g, " ").trim();
  r.note = (await page.textContent(".wipe-note")).replace(/\s+/g, " ");
  if (!r.preview.includes(`${total} caixas`) || !r.preview.includes(`${before.edges} setas`)) fail("a prévia não conta tudo o que será apagado");
  if (!/hotspots/i.test(r.note) || !/caderno/i.test(r.note)) fail("o texto não diz que hotspots saem e o caderno fica");
  await page.fill("#confirmWipeInput", "APAGAR"); await page.click("#executeWipe");

  w = await ws();
  r.after = { canvas: counts(w, CANVAS), kept: counts(w, KEPT), docs: w.docs.length, edges: w.graph.edges.length, positions: Object.values(w.graph.layouts || {}).reduce((n, l) => n + Object.keys(l).length, 0) };
  r.afterUi = { emptyVisible: await page.locator("#emptyStage").isVisible(), cards: await canvasCards(), toast: await page.textContent("#toast") };
  if (Object.values(r.after.canvas).some((n) => n !== 0) || r.after.edges || r.after.positions) fail("sobrou algo no canvas depois de limpar");
  if (r.after.docs !== before.docs || KEPT.some((k) => r.after.kept[k] !== before.kept[k])) fail("limpar o canvas mexeu no caderno ou nas classificações");
  if (!r.afterUi.emptyVisible || r.afterUi.cards !== 0) fail("a tela de canvas vazio não apareceu");
  await page.screenshot({ path: `${SHOTS}/wipe-1.png` });

  // Canvas já vazio: o botão só avisa.
  await page.waitForTimeout(400);
  await page.click("#clearCanvasBtn");
  r.alreadyEmpty = { toast: await page.textContent("#toast"), modalOpen: await page.isVisible("#confirmWipeInput") };
  if (!r.alreadyEmpty.toast.includes("já está vazio") || r.alreadyEmpty.modalOpen) fail("com o canvas vazio, Limpar deveria só avisar");

  // Recarregar: continua vazio e o caderno continua lá.
  await page.reload(); await page.waitForSelector("#emptyStage:not([hidden])");
  w = await ws();
  r.reload = { canvas: Object.values(counts(w, CANVAS)).reduce((a, b) => a + b, 0), docs: w.docs.length, cards: await canvasCards() };
  if (r.reload.canvas || r.reload.cards || r.reload.docs !== before.docs) fail("recarregar não manteve o canvas vazio com o caderno");
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(JSON.stringify(r, null, 1), "\nerrors:", errors);
await browser.close();
