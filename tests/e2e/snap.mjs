// #14 Encaixe e alinhamento: grade de 24 px, Alt solta livre, guia vence a grade, grupo encaixa pelo card pego,
// moldura na seleção leva o conteúdo, alinhar/distribuir com undo, clique com tremida não move, pontilhado segue a câmera.
import { chromium } from "playwright-core";
import { appUrl } from "./target.mjs";
const [, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1540, height: 920 } });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("dialog", (d) => d.accept());
await page.goto(appUrl()); await page.waitForSelector(".node");
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
const GRID = 24;
const NAMES = ["Snap A", "Snap B", "Snap C"];
const onGrid = (v) => ((v % GRID) + GRID) % GRID === 0;
const card = (name) => page.locator(".node", { hasText: name }).first();
const nodeEl = (k) => page.locator(`#nodes > [data-node="${k}"], #frameUi > [data-node="${k}"]`).first();
const zoomOf = async () => Number((await page.$eval("#world", (el) => el.style.transform)).match(/scale\(([\d.]+)\)/)[1]);
const layout = (w) => w.graph.layouts["lanes|scene:preconsulta"] ?? w.graph.layouts["timeline|scene:preconsulta"];
const guideCount = () => page.$$eval("#guideLayer line", (els) => els.length);
const centerOf = async (loc) => { const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const sizeOfKey = (w, k) => {
  const [kind, id] = [k.slice(0, k.indexOf(":")), k.slice(k.indexOf(":") + 1)];
  const o = kind === "frame" ? w.frames.find((f) => f.id === id) : kind === "note" ? w.canvasNotes.find((n) => n.id === id) : null;
  return o ? { w: o.w, h: o.h } : { w: 242, h: 94 };
};
const sameRect = (L1, L2, keys) => keys.every((k) => L1[k].x === L2[k].x && L1[k].y === L2[k].y);

/** Mundo ↔ tela, calibrado pela posição de um card visível. */
async function mapping(w, k) {
  const z = await zoomOf();
  const b = await nodeEl(k).boundingBox();
  const p = layout(w)[k];
  return { z, ox: b.x - p.x * z, oy: b.y - p.y * z };
}

/**
 * Posição (fora da grade de propósito: 24k+7) no centro da tela, longe de qualquer guia dos cards parados
 * e sem cobrir nenhum deles. Com `fixedY`, só procura o x; o destino fica a mais de 80 px (mundo) de onde o card está.
 */
async function freeSpot(w, moving, fixedY) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const m = await mapping(w, moving[0]);
    const L = layout(w);
    const keys = (await page.$$eval("#nodes > [data-node], #frameUi > [data-node]", (els) => els.map((e) => e.dataset.node))).filter((k) => !moving.includes(k) && L[k]);
    const rects = keys.map((k) => ({ ...L[k], ...sizeOfKey(w, k) }));
    const vertical = rects.flatMap((q) => [q.x, q.x + q.w / 2, q.x + q.w]);
    const horizontal = rects.flatMap((q) => [q.y, q.y + q.h / 2, q.y + q.h]);
    const st = await page.locator("#stage").boundingBox();
    const toWorld = (sx, sy) => [(sx - m.ox) / m.z, (sy - m.oy) / m.z];
    const [x0, y0] = toWorld(st.x + st.width * 0.25, st.y + st.height * 0.15);
    const [x1, y1] = toWorld(st.x + st.width * 0.72, st.y + st.height * 0.62);
    // O encaixe da guia vale até 6 px de tela; a folga cobre isso e o arredondamento do mouse.
    const clearance = 10 / m.z;
    const clear = (v, len, lines) => [0, len / 2, len].every((o) => lines.every((at) => Math.abs(v + o - at) > clearance));
    const free = (x, y) => rects.every((q) => x + 242 + 16 < q.x || q.x + q.w + 16 < x || y + 94 + 16 < q.y || q.y + q.h + 16 < y);
    for (let gy = Math.ceil(y0 / GRID) * GRID; gy <= y1 - 94; gy += GRID) {
      const y = fixedY ?? gy + 7;
      if (fixedY === undefined && !clear(y, 94, horizontal)) continue;
      for (let gx = Math.ceil(x0 / GRID) * GRID; gx <= x1 - 242; gx += GRID) {
        const x = gx + 7;
        const here = L[moving[0]];
        if (Math.hypot(x - here.x, y - here.y) > 80 && clear(x, 242, vertical) && free(x, y)) return { x, y };
      }
      if (fixedY !== undefined) break;
    }
    await page.click("#zoomOut");
    await page.waitForTimeout(150);
  }
  throw new Error("nenhuma posição livre de guias no centro da tela");
}

/** Arrasta pelo ponto (sx, sy) até o card `k` ir para o ponto do mundo (tx, ty). */
async function dragCardTo(w, k, tx, ty, { alt = false, grab, beforeUp } = {}) {
  const z = await zoomOf();
  const p = layout(w)[k];
  const [sx, sy] = grab ?? (await centerOf(nodeEl(k)));
  const dx = (tx - p.x) * z, dy = (ty - p.y) * z;
  await page.waitForTimeout(500); // dois pointerdown no mesmo card em menos de 450 ms viram duplo clique
  if (alt) await page.keyboard.down("Alt");
  await page.mouse.move(sx, sy); await page.mouse.down();
  await page.mouse.move(sx + dx / 2, sy + dy / 2, { steps: 4 });
  await page.mouse.move(sx + dx, sy + dy, { steps: 4 });
  const during = beforeUp ? await beforeUp() : undefined;
  await page.mouse.up();
  if (alt) await page.keyboard.up("Alt");
  return during;
}

async function shiftClick(loc) {
  const [x, y] = await centerOf(loc);
  await page.keyboard.down("Shift"); await page.mouse.click(x, y); await page.keyboard.up("Shift");
}

async function selectOnly(locs) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const [x, y] = await centerOf(locs[0]);
  await page.mouse.click(x, y);
  for (const loc of locs.slice(1)) await shiftClick(loc);
}

try {
  await page.click('[data-focus-scene="preconsulta"]'); await page.keyboard.press("Escape");
  let [x, y] = await centerOf(card("PreConsultaFinalizada"));
  await page.mouse.click(x, y);
  await page.keyboard.press("Tab");
  for (let i = 0; i < NAMES.length; i++) {
    await page.keyboard.type(NAMES[i]);
    await page.keyboard.press(i < NAMES.length - 1 ? "Tab" : "Enter");
  }
  await page.keyboard.press("Escape");
  await page.click("#fitBtn");
  await page.click("#zoomOut");
  let w = await ws();
  const keyOf = (name) => "event:" + w.events.find((e) => e.name === name)?.id;
  const [kA, kB, kC] = NAMES.map(keyOf);

  // 1) Longe de guias, soltar fora da grade encaixa na grade; a guia não aparece.
  let spot = await freeSpot(w, [kA]);
  await page.keyboard.press("Escape");
  await dragCardTo(w, kA, spot.x, spot.y);
  w = await ws();
  let pA = layout(w)[kA];
  r.grid = { dropped: spot, landed: pA, guides: await guideCount() };
  if (!onGrid(pA.x) || !onGrid(pA.y) || Math.abs(pA.x - spot.x) > 12 || Math.abs(pA.y - spot.y) > 12) fail("soltar longe das guias não encaixou na grade");

  // 2) Com Alt, solta exatamente onde o mouse deixou (sem grade).
  spot = await freeSpot(w, [kA]);
  const zAlt = await zoomOf();
  await dragCardTo(w, kA, spot.x, spot.y, { alt: true });
  w = await ws();
  pA = layout(w)[kA];
  r.alt = { dropped: spot, landed: pA };
  const tolerance = Math.ceil(1 / zAlt) + 1;
  if (Math.abs(pA.x - spot.x) > tolerance || Math.abs(pA.y - spot.y) > tolerance || (onGrid(pA.x) && onGrid(pA.y))) fail("Alt não soltou livre");

  // 3) Perto do topo de outro card, a guia vence a grade: o topo fica igual ao do vizinho, com a linha visível.
  const pB = layout(w)[kB];
  spot = await freeSpot(w, [kA], pB.y + 4);
  const guidesDuring = await dragCardTo(w, kA, spot.x, spot.y, {
    beforeUp: async () => { await page.screenshot({ path: `${SHOTS}/snap-guide.png` }); return guideCount(); },
  });
  w = await ws();
  pA = layout(w)[kA];
  r.guide = { neighbourTop: pB.y, landedTop: pA.y, guidesDuring, guidesAfter: await guideCount() };
  if (pA.y !== pB.y) fail("perto do alinhamento não encaixou no topo do vizinho");
  if (!guidesDuring || r.guide.guidesAfter !== 0) fail("a guia não apareceu no arraste ou não sumiu ao soltar");
  await page.screenshot({ path: `${SHOTS}/snap-1.png` });

  // 4) Clique com tremida (2 px) não move nem encaixa o card.
  let before = JSON.parse(JSON.stringify(layout(w)));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  [x, y] = await centerOf(nodeEl(kA));
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 2, y + 1); await page.mouse.up();
  w = await ws();
  r.jitterStill = sameRect(before, layout(w), [kA]);
  if (!r.jitterStill) fail("clique com tremida moveu o card");

  // 5) Grupo: o card pego encaixa na grade e o outro anda o mesmo tanto.
  await selectOnly([nodeEl(kA), nodeEl(kB)]);
  before = JSON.parse(JSON.stringify(layout(w)));
  spot = await freeSpot(w, [kA, kB]);
  await dragCardTo(w, kA, spot.x, spot.y);
  w = await ws();
  let L = layout(w);
  const delta = (k) => [L[k].x - before[k].x, L[k].y - before[k].y];
  r.group = { a: delta(kA), b: delta(kB), aOnGrid: onGrid(L[kA].x) && onGrid(L[kA].y) };
  if (!r.group.aOnGrid || r.group.a[0] !== r.group.b[0] || r.group.a[1] !== r.group.b[1]) fail("arraste em grupo não encaixou pelo card pego");

  // 6) Moldura em volta de C; seleção A + moldura arrastada leva C (que não está selecionado).
  await selectOnly([nodeEl(kC)]);
  await page.keyboard.press("f");
  await page.keyboard.type("Caixa Snap"); await page.keyboard.press("Enter");
  w = await ws();
  const kF = "frame:" + w.frames.at(-1).id;
  const head = page.locator(`[data-node="${kF}"] .frame-head`);
  await selectOnly([nodeEl(kA), head]);
  before = JSON.parse(JSON.stringify(layout(w)));
  [x, y] = await centerOf(nodeEl(kA));
  await page.waitForTimeout(500);
  await page.keyboard.down("Alt");
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 30, y + 24, { steps: 5 }); await page.mouse.up();
  await page.keyboard.up("Alt");
  w = await ws();
  L = layout(w);
  r.frameInSelection = { a: delta(kA), frame: delta(kF), content: delta(kC) };
  const eq = (p, q) => p[0] === q[0] && p[1] === q[1];
  if (r.frameInSelection.a[0] === 0 || !eq(r.frameInSelection.a, r.frameInSelection.frame) || !eq(r.frameInSelection.a, r.frameInSelection.content)) fail("moldura na seleção não levou o conteúdo");

  // 7) Alinhar A, B e a moldura (que leva C), cada um com um Ctrl+Z.
  await selectOnly([nodeEl(kA), nodeEl(kB), head]);
  const fSize = sizeOfKey(w, kF);
  const sized = (k) => (k === kF ? fSize : { w: 242, h: 94 });
  const trio = [kA, kB, kF];
  const checks = {
    left: (Q) => trio.every((k) => Q[k].x === Math.min(...trio.map((q) => before7[q].x))),
    center: (Q) => trio.every((k) => Math.abs(Q[k].x + sized(k).w / 2 - (Q[kA].x + 121)) <= 1),
    right: (Q) => trio.every((k) => Q[k].x + sized(k).w === Q[kA].x + 242),
    top: (Q) => trio.every((k) => Q[k].y === Math.min(...trio.map((q) => before7[q].y))),
    middle: (Q) => trio.every((k) => Math.abs(Q[k].y + sized(k).h / 2 - (Q[kA].y + 47)) <= 1),
    bottom: (Q) => trio.every((k) => Q[k].y + sized(k).h === Q[kA].y + 94),
  };
  const before7 = JSON.parse(JSON.stringify(layout(w)));
  // O Ctrl+Z limpa a seleção (comportamento geral do undo): cada passo seleciona o trio de novo.
  const selectTrio = () => selectOnly([nodeEl(kA), nodeEl(kB), head]);
  r.align = {};
  for (const [edge, ok] of Object.entries(checks)) {
    await selectTrio();
    if (edge === "left") await page.screenshot({ path: `${SHOTS}/snap-2.png` });
    await page.click(`[data-align="${edge}"]`);
    w = await ws();
    const Q = layout(w);
    const frameMoved = [Q[kF].x - before7[kF].x, Q[kF].y - before7[kF].y];
    const contentMoved = [Q[kC].x - before7[kC].x, Q[kC].y - before7[kC].y];
    await page.keyboard.press("Meta+z");
    const back = sameRect(before7, layout(await ws()), [...trio, kC]);
    r.align[edge] = { ok: ok(Q), contentFollows: eq(frameMoved, contentMoved), undo: back };
    if (!ok(Q)) fail(`alinhar ${edge} não alinhou`);
    if (!eq(frameMoved, contentMoved)) fail(`alinhar ${edge}: a moldura não levou o conteúdo`);
    if (!back) fail(`Ctrl+Z não desfez o alinhar ${edge}`);
  }
  w = await ws();

  // 8) Distribuir com 3: espaços iguais, primeiro e último parados, um Ctrl+Z desfaz.
  for (const axis of ["horizontal", "vertical"]) {
    await selectTrio();
    await page.click(`[data-distribute="${axis}"]`);
    w = await ws();
    const Q = layout(w);
    const start = (k) => (axis === "horizontal" ? Q[k].x : Q[k].y);
    const len = (k) => (axis === "horizontal" ? sized(k).w : sized(k).h);
    const startBefore = (k) => (axis === "horizontal" ? before7[k].x : before7[k].y);
    const order = [...trio].sort((p, q) => startBefore(p) - startBefore(q));
    const gaps = [start(order[1]) - (start(order[0]) + len(order[0])), start(order[2]) - (start(order[1]) + len(order[1]))];
    const endsStill = start(order[0]) === startBefore(order[0]) && start(order[2]) === startBefore(order[2]);
    await page.keyboard.press("Meta+z");
    const back = sameRect(before7, layout(await ws()), [...trio, kC]);
    r[`distribute_${axis}`] = { gaps, endsStill, undo: back };
    if (Math.abs(gaps[0] - gaps[1]) > 1 || !endsStill) fail(`distribuir na ${axis} não deixou espaços iguais`);
    if (!back) fail(`Ctrl+Z não desfez o distribuir na ${axis}`);
  }

  // 9) Com 2 selecionados, distribuir fica desabilitado.
  await selectOnly([nodeEl(kA), nodeEl(kB)]);
  r.distributeDisabledWithTwo = {
    title: await page.textContent("#inspectTitle"),
    disabled: await page.$$eval("[data-distribute]", (els) => els.length === 2 && els.every((b) => b.disabled)),
  };
  if (!r.distributeDisabledWithTwo.disabled) fail("distribuir deveria ficar desabilitado com 2 elementos");

  // 10) O pontilhado acompanha a câmera (pan e zoom).
  await page.keyboard.press("Escape");
  const dots = () => page.$eval("#stage", (el) => ({ pos: el.style.backgroundPosition, size: el.style.backgroundSize }));
  const dots0 = await dots();
  const st = await page.locator("#stage").boundingBox();
  let startPan = null;
  for (let gy = st.y + 60; gy < st.y + st.height - 60 && !startPan; gy += 40)
    for (let gx = st.x + 260; gx < st.x + st.width - 60 && !startPan; gx += 40) {
      const isBg = await page.evaluate(([px, py]) => {
        const el = document.elementFromPoint(px, py);
        return !!el && !!el.closest("#stage") && !el.closest("[data-node],[data-edge],[data-emo-scene],#esLegend,.zoomhud,.stage-over,.lane-gutter");
      }, [gx, gy]);
      if (isBg) startPan = [gx, gy];
    }
  await page.mouse.move(startPan[0], startPan[1]); await page.mouse.down(); await page.mouse.move(startPan[0] + 50, startPan[1] + 30, { steps: 3 }); await page.mouse.up();
  const dots1 = await dots();
  await page.click("#zoomIn");
  const dots2 = await dots();
  const z2 = await zoomOf();
  const spacing = parseFloat(dots2.size);
  const ratio = spacing / (GRID * z2);
  r.dots = { beforePan: dots0, afterPan: dots1, afterZoom: dots2, ratio: Math.round(ratio * 100) / 100 };
  if (dots0.pos === dots1.pos) fail("o pontilhado não acompanhou o pan");
  if (!(spacing >= 12) || Math.abs(Math.log2(ratio) - Math.round(Math.log2(ratio))) > 0.01) fail("o pontilhado não segue o passo da grade no zoom");

  // 11) Recarregar mantém as posições encaixadas.
  w = await ws();
  const saved = JSON.parse(JSON.stringify(layout(w)));
  await page.reload(); await page.waitForSelector(".node");
  r.reloadKeeps = sameRect(saved, layout(await ws()), [kA, kB, kC, kF]);
  if (!r.reloadKeeps) fail("recarregar perdeu as posições");
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(JSON.stringify(r, null, 1), "\nerrors:", errors);
await browser.close();
