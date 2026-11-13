// #13 Seleção múltipla: laço com Shift, Shift+clique, arraste em grupo, lote no inspetor, exclusão em lote e undo em um passo.
import { chromium } from "playwright-core";
import { openApp } from "./target.mjs";
const [, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1540, height: 920 } });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("dialog", (d) => d.accept());
await openApp(page); await page.waitForSelector(".node");
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const LOTE = ["Lote 1", "Lote 2", "Lote 3", "Lote 4", "Lote 5"];
const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
const card = (name) => page.locator(".node", { hasText: name }).first();
const centerOf = async (name) => { const b = await card(name).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const camera = () => page.$eval("#world", (el) => el.style.transform);
const zoomOf = async () => Number((await camera()).match(/scale\(([\d.]+)\)/)[1]);
const title = () => page.textContent("#inspectTitle");
const layout = (w) => w.graph.layouts["lanes|scene:preconsulta"] ?? w.graph.layouts["timeline|scene:preconsulta"];
const loteKeys = (w) => LOTE.map((n) => "event:" + w.events.find((e) => e.name === n)?.id);
// Ponto livre do canvas (sem card, seta, legenda ou controles por cima).
const isBackground = (x, y) =>
  page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    return !!el && !!el.closest("#stage") && !el.closest("[data-node],[data-edge],[data-emo-scene],#esLegend,.zoomhud,.stage-over,.lane-gutter");
  }, [x, y]);

async function lassoAround(names) {
  const boxes = await Promise.all(names.map((n) => card(n).boundingBox()));
  const x0 = Math.min(...boxes.map((b) => b.x)) - 12, y0 = Math.min(...boxes.map((b) => b.y)) - 12;
  const x1 = Math.max(...boxes.map((b) => b.x + b.width)) + 12, y1 = Math.max(...boxes.map((b) => b.y + b.height)) + 12;
  // Começa por um canto livre: Shift+clique em cima de card alternaria a seleção em vez de abrir o laço.
  const corners = [[x0, y0, x1, y1], [x1, y1, x0, y0], [x1, y0, x0, y1], [x0, y1, x1, y0]];
  for (const [sx, sy, ex, ey] of corners) {
    if (!(await isBackground(sx, sy))) continue;
    await page.keyboard.down("Shift");
    await page.mouse.move(sx, sy); await page.mouse.down();
    await page.mouse.move((sx + ex) / 2, (sy + ey) / 2, { steps: 4 });
    await page.mouse.move(ex, ey, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    return { x0, y0, x1, y1 };
  }
  throw new Error("nenhum canto livre para iniciar o laço");
}

try {
  await page.click('[data-focus-scene="preconsulta"]'); await page.keyboard.press("Escape");
  // 5 eventos novos em sequência (Tab encadeia), depois enquadra o recorte.
  let [x, y] = await centerOf("Pré-consulta concluída");
  await page.mouse.click(x, y);
  await page.keyboard.press("Tab");
  for (let i = 0; i < LOTE.length; i++) {
    await page.keyboard.type(LOTE[i]);
    await page.keyboard.press(i < LOTE.length - 1 ? "Tab" : "Enter");
  }
  await page.keyboard.press("Escape");
  await page.click("#fitBtn");
  let w = await ws();
  const keys = loteKeys(w);
  r.created = keys.every((k) => !k.endsWith("undefined"));
  if (!r.created) throw new Error("eventos do lote não foram criados");

  // 1) Laço com Shift: seleciona os 5 inteiros, sem mover a câmera.
  const camBefore = await camera();
  await lassoAround(LOTE);
  r.lasso = { title: await title(), selectedCards: await page.$$eval(".node.selected", (n) => n.map((e) => e.dataset.node)), cameraStill: (await camera()) === camBefore };
  const selectedSet = new Set(r.lasso.selectedCards);
  if (!keys.every((k) => selectedSet.has(k))) fail("laço não selecionou os 5 eventos");
  if (r.lasso.title !== `${selectedSet.size} elementos selecionados`) fail("inspetor em lote ausente");
  if (!r.lasso.cameraStill) fail("Shift+arraste moveu a câmera");
  r.lassoExactlyLote = selectedSet.size === 5;
  await page.screenshot({ path: `${SHOTS}/multiselect-1.png` });

  // 2) Arrastar um dos selecionados move todos; um Ctrl+Z desfaz o grupo inteiro.
  const before = JSON.parse(JSON.stringify(layout(w)));
  const z = await zoomOf();
  [x, y] = await centerOf("Lote 3");
  // Alt: movimento livre (sem encaixe da #14), para conferir o deslocamento exato. O encaixe está em snap.mjs.
  await page.keyboard.down("Alt");
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 40, y + 70, { steps: 4 }); await page.mouse.move(x + 80, y + 140, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  w = await ws();
  const after = layout(w);
  const deltas = keys.map((k) => [after[k].x - before[k].x, after[k].y - before[k].y]);
  const others = Object.keys(before).filter((k) => !selectedSet.has(k));
  r.groupMove = {
    sameDelta: deltas.every(([dx, dy]) => dx === deltas[0][0] && dy === deltas[0][1]),
    delta: deltas[0],
    expected: [Math.round(80 / z), Math.round(140 / z)],
    othersStill: others.every((k) => after[k]?.x === before[k].x && after[k]?.y === before[k].y),
  };
  if (!r.groupMove.sameDelta || Math.abs(deltas[0][0] - r.groupMove.expected[0]) > 2 || Math.abs(deltas[0][1] - r.groupMove.expected[1]) > 2) fail("arraste em grupo inconsistente");
  if (!r.groupMove.othersStill) fail("arraste em grupo moveu cards fora da seleção");
  await page.keyboard.press("Meta+z");
  w = await ws();
  r.groupUndo = keys.every((k) => layout(w)[k].x === before[k].x && layout(w)[k].y === before[k].y);
  if (!r.groupUndo) fail("um Ctrl+Z não desfez o arraste em grupo");

  // 3) Tipo semântico em lote, com um passo de undo.
  await lassoAround(LOTE);
  const semValue = await page.$eval("#batch-semanticType", (s) => [...s.options].find((o) => o.value && !o.selected)?.value);
  await page.selectOption("#batch-semanticType", semValue);
  w = await ws();
  r.batchSemantic = { value: semValue, all: keys.every((k) => w.events.find((e) => "event:" + e.id === k).semanticType === semValue), toast: await page.textContent("#toast") };
  if (!r.batchSemantic.all) fail("tipo semântico em lote não aplicou");
  await page.click("#inspectBody .hint"); // tira o foco do select (atalhos ignoram campos)
  await page.keyboard.press("Meta+z");
  w = await ws();
  r.batchSemanticUndo = keys.every((k) => w.events.find((e) => "event:" + e.id === k).semanticType !== semValue);
  if (!r.batchSemanticUndo) fail("undo do lote não voltou o tipo semântico");

  // 4) H com vários selecionados não cria hotspot solto.
  await lassoAround(LOTE);
  const hotspotsBefore = w.decisions.length;
  await page.keyboard.press("h");
  w = await ws();
  r.hotspotBlocked = { toast: await page.textContent("#toast"), unchanged: w.decisions.length === hotspotsBefore };
  if (!r.hotspotBlocked.unchanged || !/único card/.test(r.hotspotBlocked.toast)) fail("H com seleção múltipla não foi bloqueado");

  // 5) Shift+clique tira e devolve um card; clique simples num selecionado deixa só ele.
  [x, y] = await centerOf("Lote 1");
  await page.keyboard.down("Shift"); await page.mouse.click(x, y); await page.keyboard.up("Shift");
  r.shiftToggleOff = await title();
  await page.keyboard.down("Shift"); await page.mouse.click(x, y); await page.keyboard.up("Shift");
  r.shiftToggleOn = await title();
  if (r.shiftToggleOff !== `${selectedSet.size - 1} elementos selecionados` || r.shiftToggleOn !== `${selectedSet.size} elementos selecionados`) fail("Shift+clique não alternou a seleção");
  [x, y] = await centerOf("Lote 2");
  await page.mouse.click(x, y);
  r.plainClickCollapses = await title();
  if (r.plainClickCollapses !== "Lote 2") fail("clique simples não reduziu a seleção a um card");

  // 6) Del exclui todos com uma confirmação; um Ctrl+Z devolve todos.
  await lassoAround(LOTE);
  const eventsBefore = w.events.length;
  await page.keyboard.press("Delete");
  w = await ws();
  r.batchDelete = { removed: eventsBefore - w.events.length, toast: await page.textContent("#toast") };
  if (r.batchDelete.removed !== 5) fail("exclusão em lote não removeu os 5");
  await page.keyboard.press("Meta+z");
  w = await ws();
  r.batchDeleteUndo = w.events.length === eventsBefore && loteKeys(w).every((k) => !k.endsWith("undefined"));
  if (!r.batchDeleteUndo) fail("um Ctrl+Z não devolveu a exclusão em lote");

  // 7) Cena + um só evento: a cena deixaria filhos órfãos, então nada é excluído.
  const sceneBox = await page.locator('[data-node="scene:preconsulta"]').boundingBox();
  await page.mouse.click(sceneBox.x + sceneBox.width / 2, sceneBox.y + sceneBox.height / 2);
  [x, y] = await centerOf("Lote 4");
  await page.keyboard.down("Shift"); await page.mouse.click(x, y); await page.keyboard.up("Shift");
  const beforeOrphan = w.events.length;
  await page.keyboard.press("Delete");
  w = await ws();
  r.orphanGuard = { toast: await page.textContent("#toast"), unchanged: w.events.length === beforeOrphan && w.scenes.some((s) => s.id === "preconsulta") };
  if (!r.orphanGuard.unchanged || !/filhos/.test(r.orphanGuard.toast)) fail("exclusão em lote deixou filhos órfãos");

  // 8) Esc limpa; arraste sem Shift no fundo continua fazendo pan.
  await page.keyboard.press("Escape");
  r.escClears = await title();
  const stage = await page.locator("#stage").boundingBox();
  let start = null;
  for (let gy = stage.y + 60; gy < stage.y + stage.height - 60 && !start; gy += 40)
    for (let gx = stage.x + 260; gx < stage.x + stage.width - 60 && !start; gx += 40) if (await isBackground(gx, gy)) start = [gx, gy];
  const camPan = await camera();
  await page.mouse.move(start[0], start[1]); await page.mouse.down(); await page.mouse.move(start[0] + 60, start[1] + 30, { steps: 3 }); await page.mouse.up();
  r.plainDragPans = (await camera()) !== camPan;
  if (!r.plainDragPans) fail("arraste sem Shift deixou de fazer pan");
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(JSON.stringify(r, null, 1), "\nerrors:", errors);
await browser.close();
