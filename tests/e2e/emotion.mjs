import { chromium } from "playwright-core";
import { openApp } from "./target.mjs";
import fs from "node:fs";
const [, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 }, acceptDownloads: true })).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await openApp(page); await page.waitForSelector(".node");
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const sc = async (id) => (await ws()).scenes.find((s) => s.id === id);
const r = {};
try {
  await page.click('[data-focus-chapter="consulta"]'); await page.keyboard.press("Escape");
  await page.click("#zoomFit");
  r.band = await page.$$eval(".emo-dot", (d) => ({ dots: d.length, unrated: d.filter((x) => x.classList.contains("unrated")).length }));
  r.gutter = await page.$$eval(".lane-label.emotion", (l) => l.map((x) => x.title));
  // banda acima de todos os cards
  r.bandAbove = await page.evaluate(() => {
    const b = document.querySelector(".emo-band").getBoundingClientRect();
    const tops = [...document.querySelectorAll(".node")].map((n) => n.getBoundingClientRect().top);
    return b.bottom <= Math.min(...tops) + 1;
  });
  // arrastar o ponto da preconsulta para baixo 2 níveis → −2
  const dot = page.locator('.emo-dot[data-emo-scene="preconsulta"]');
  const box = await dot.boundingBox();
  const z = await page.evaluate(() => parseFloat(document.querySelector("#zoomLabel").textContent) / 100);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 44 * z, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 90 * z, { steps: 4 });
  await page.mouse.up();
  r.dragDown = (await sc("preconsulta")).emotion;
  r.selectedAfterDrag = await page.textContent("#inspectTitle");
  r.inspectorNow = await page.textContent(".emo-now");
  r.cardBadge = await page.textContent('[data-node="scene:preconsulta"] .emo-tag');
  // desfazer
  await page.keyboard.press("Meta+z");
  r.undo = (await sc("preconsulta")).emotion ?? null;
  // inspetor: botões
  await page.click('[data-focus-scene="preconsulta"]');
  await page.click('[data-emotion="-1"]');
  r.inspectorSet = (await sc("preconsulta")).emotion;
  await page.click('[data-focus-scene="identidade"]', { timeout: 5000 }).catch((err) => { throw new Error(`cena identidade indisponível na árvore: ${err.message}`); });
  // dor + virar hotspot
  await page.click('[data-focus-scene="preconsulta"]');
  await page.fill('[data-field="pain"]', "Paciente espera sem saber quanto falta para ser chamado");
  await page.locator('[data-field="pain"]').blur();
  r.pain = (await sc("preconsulta")).pain;
  r.cardPain = await page.$$eval('[data-node="scene:preconsulta"] .pain-tag', (x) => x.length);
  r.painChip = await page.$$eval('.emo-pain[data-emo-scene="preconsulta"] text', (x) => x.map((t) => t.textContent));
  const before = (await ws()).decisions.length;
  await page.click("[data-pain-hotspot]");
  await page.keyboard.press("Enter");
  let w = await ws();
  const h = w.decisions[w.decisions.length - 1];
  r.hotspot = { created: w.decisions.length === before + 1, name: h.title, linked: w.graph.edges.some((e) => e.from === "scene:preconsulta" && e.to === "hotspot:" + h.id) };
  // dar nota +2 numa outra cena pelo inspetor e ver a curva (path)
  await page.click('[data-focus-scene="chamada-medico"]', { timeout: 5000 }).catch((err) => { throw new Error(`cena chamada-medico indisponível na árvore: ${err.message}`); });
  const other = (await ws()).scenes.find((s) => s.chapter === "consulta" && s.id !== "preconsulta");
  await page.click(`[data-focus-scene="${other.id}"]`);
  await page.click('[data-emotion="2"]');
  await page.click('[data-focus-chapter="consulta"]'); await page.keyboard.press("Escape");
  r.curvePath = await page.$$eval(".emo-band path[stroke='#7a6248']", (p) => p.length);
  r.gutterAfter = await page.$$eval(".lane-label.emotion small", (l) => l.map((x) => x.textContent));
  // clique no chip da dor seleciona a cena sem mudar nota
  await page.click('.emo-pain[data-emo-scene="preconsulta"]');
  r.chipSelects = await page.textContent("#inspectTitle");
  r.chipKeepsValue = (await sc("preconsulta")).emotion;
  await page.dblclick('.emo-dot[data-emo-scene="preconsulta"]', { force: true });
  r.dblclickNoModal = !(await page.evaluate(() => [...document.querySelectorAll("dialog")].some((d) => d.open)));
  r.dblclickKeepsValue = (await sc("preconsulta")).emotion;
  await page.screenshot({ path: `${SHOTS}/emotion-1.png` });
  // toggle
  await page.click("#emotionBtn");
  r.off = { band: await page.$$eval(".emo-band", (b) => b.length), pressed: await page.getAttribute("#emotionBtn", "aria-pressed") };
  await page.click("#emotionBtn");
  await page.click('[data-layout="layers"]');
  r.layers = { disabled: await page.isDisabled("#emotionBtn"), band: await page.$$eval(".emo-band", (b) => b.length), badge: await page.$$eval('[data-node="scene:preconsulta"] .scene-badges span', (x) => x.map((s) => s.textContent)) };
  await page.click('[data-layout="timeline"]');
  // exports
  let [dl] = await Promise.all([page.waitForEvent("download"), page.click("#svgBtn")]);
  const svg = fs.readFileSync(await dl.path(), "utf8");
  r.svg = { title: svg.includes("Curva de emoção"), pain: svg.includes("⚡ Paciente espera"), interactive: svg.includes("data-emo-scene") };
  [dl] = await Promise.all([page.waitForEvent("download"), page.click("#jsonCSV")]);
  const csv = fs.readFileSync(await dl.path(), "utf8");
  r.csv = { header: csv.split("\n")[0].includes('"Emoção da cena","Dor da cena"'), row: csv.includes('"−1 Ruim","Paciente espera') };
  // persistência após reload + sanitização de valor inválido via import-like
  await page.reload(); await page.waitForSelector(".emo-dot");
  r.reload = (await sc("preconsulta")).emotion;
  await page.screenshot({ path: `${SHOTS}/emotion-2.png` });
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(JSON.stringify(r, null, 1), "\nerrors:", errors);
await browser.close();
