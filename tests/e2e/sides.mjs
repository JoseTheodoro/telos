// #15 Conectores nos 4 lados: portas no hover, ligar de baixo de A para o topo de B, seta acompanha o arraste,
// soltar no corpo deixa a entrada automática, modo Conectar com porta, inspetor (lado + undo + Automático),
// SVG exportado, recarregar e importação com lado inválido.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
const [ROOT, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1540, height: 920 } });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("dialog", (d) => d.accept());
await page.goto(`file://${ROOT}/dist/index.html`); await page.waitForSelector(".node");
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
const layout = (w) => w.graph.layouts["lanes|scene:preconsulta"] ?? w.graph.layouts["timeline|scene:preconsulta"];
const card = (name) => page.locator("#nodes > .node", { hasText: name }).first();
const nodeEl = (k) => page.locator(`#nodes > [data-node="${k}"]`);
const portOf = (k, side) => page.locator(`#nodes > [data-node="${k}"] > .port.${side}`);
const centerOf = async (loc) => { const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const opacityOf = (loc) => loc.evaluate((el) => getComputedStyle(el).opacity);
const edgeBetween = (w, a, b) => w.graph.edges.find((e) => e.from === a && e.to === b);
/** Ponto inicial e final do caminho desenhado da seta. */
const endsOf = async (id) => {
  const d = await page.getAttribute(`#edgePaths [data-edge="${id}"] path.edge-line`, "d");
  const n = d.match(/-?[\d.]+/g).map(Number);
  return { start: [n[0], n[1]], end: [n[n.length - 2], n[n.length - 1]] };
};
const near = (p, q) => Math.abs(p[0] - q[0]) <= 1 && Math.abs(p[1] - q[1]) <= 1;
const heightOf = (k) => nodeEl(k).evaluate((el) => el.offsetHeight);

async function dragLink(fromPort, toLoc, { beforeUp } = {}) {
  const [cx, cy] = await centerOf(fromPort.locator(".."));
  await page.mouse.move(cx, cy); // passa pelo card: as portas aparecem no hover
  const [px, py] = await centerOf(fromPort);
  const [tx, ty] = await centerOf(toLoc);
  await page.mouse.move(px, py);
  const onPort = await page.evaluate(([qx, qy]) => !!document.elementFromPoint(qx, qy)?.matches(".port"), [px, py]);
  if (!onPort) throw new Error("o mouse não está sobre a porta de origem");
  await page.mouse.down();
  await page.mouse.move((px + tx) / 2, (py + ty) / 2, { steps: 4 });
  await page.mouse.move(tx, ty, { steps: 4 });
  const during = beforeUp ? await beforeUp([tx, ty]) : undefined;
  await page.mouse.up();
  return during;
}

/** Pan pelo fundo até o meio de dois cards ficar no centro do palco (só para o print). */
async function centerOnScreen(locA, locB) {
  const st = await page.locator("#stage").boundingBox();
  const [ax, ay] = await centerOf(locA);
  const [bx, by] = await centerOf(locB);
  const dx = st.x + st.width / 2 - (ax + bx) / 2, dy = st.y + st.height / 2 - (ay + by) / 2;
  for (let gy = st.y + 40; gy < st.y + st.height - 40; gy += 30)
    for (let gx = st.x + 40; gx < st.x + st.width - 40; gx += 30) {
      const free = await page.evaluate(([px, py]) => {
        const el = document.elementFromPoint(px, py);
        return !!el && !!el.closest("#stage") && !el.closest("[data-node],[data-edge],[data-emo-scene],#esLegend,.zoomhud,.stage-over,.lane-gutter");
      }, [gx, gy]);
      if (!free) continue;
      await page.mouse.move(gx, gy); await page.mouse.down(); await page.mouse.move(gx + dx, gy + dy, { steps: 5 }); await page.mouse.up();
      return;
    }
}

/** Clica no meio do caminho da seta (seleciona a seta). */
async function clickEdge(id) {
  const pt = await page.$eval(`#edgePaths [data-edge="${id}"] path.edge-hit`, (p) => {
    const at = p.getPointAtLength(p.getTotalLength() / 2);
    const m = p.getScreenCTM();
    return [at.x * m.a + at.y * m.c + m.e, at.x * m.b + at.y * m.d + m.f];
  });
  await page.mouse.click(pt[0], pt[1]);
}

try {
  // A e B: eventos irmãos (Enter), um abaixo do outro, sem seta entre eles.
  await page.click('[data-focus-scene="preconsulta"]'); await page.keyboard.press("Escape");
  let [x, y] = await centerOf(card("PreConsultaFinalizada"));
  await page.mouse.click(x, y);
  await page.keyboard.press("Enter"); await page.keyboard.type("Lado A"); await page.keyboard.press("Enter");
  await page.keyboard.press("Enter"); await page.keyboard.type("Lado B"); await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.click("#fitBtn");
  let w = await ws();
  const keyOf = (name) => "event:" + w.events.find((e) => e.name === name)?.id;
  const kA = keyOf("Lado A"), kB = keyOf("Lado B"), kT = keyOf("PréConsultaIniciada");
  let L = layout(w);
  r.setup = { a: L[kA], b: L[kB], bBelowA: L[kB].y > L[kA].y + 94, noEdge: !edgeBetween(w, kA, kB) };
  if (!r.setup.noEdge) fail("preparação: já existe seta A → B");

  // 1) Portas: escondidas fora do hover, as 4 aparecem ao passar o mouse.
  await page.mouse.move(5, 5); await page.waitForTimeout(200);
  r.portsHidden = await opacityOf(portOf(kA, "bottom"));
  [x, y] = await centerOf(nodeEl(kA));
  await page.mouse.move(x, y); await page.waitForTimeout(200);
  r.portsOnHover = await Promise.all(["top", "right", "bottom", "left"].map((s) => opacityOf(portOf(kA, s))));
  if (r.portsHidden !== "0" || r.portsOnHover.some((o) => o !== "1")) fail("as 4 portas não aparecem só no hover");

  // 2) De baixo de A para o topo de B: grava os lados; a seta começa na borda real de baixo de A e termina no topo de B.
  r.duringLink = await dragLink(portOf(kA, "bottom"), portOf(kB, "top"), {
    beforeUp: async ([tx, ty]) => ({
      linking: await page.$eval("#stage", (s) => s.classList.contains("linking")),
      targetPortVisible: await opacityOf(portOf(kB, "top")),
      underIsPort: await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.matches(".port.top") ?? false, [tx, ty]),
    }),
  });
  w = await ws(); L = layout(w);
  let ab = edgeBetween(w, kA, kB);
  if (!ab) throw new Error("a seta A → B não foi criada");
  const hA = await heightOf(kA);
  let ends = await endsOf(ab.id);
  r.bottomToTop = { fromSide: ab.fromSide, toSide: ab.toSide, ends, heightA: hA, linkingAfter: await page.$eval("#stage", (s) => s.classList.contains("linking")) };
  if (ab.fromSide !== "bottom" || ab.toSide !== "top") fail("os lados da seta não foram gravados");
  if (!near(ends.start, [L[kA].x + 121, L[kA].y + hA]) || !near(ends.end, [L[kB].x + 121, L[kB].y])) fail("a seta não sai de baixo de A ou não entra no topo de B");
  if (r.bottomToTop.linkingAfter) fail("as portas continuaram visíveis depois de soltar");
  // Aproxima (roda do mouse no meio de A e B) para o print mostrar a seta de perto; depois reenquadra.
  const [ax, ay] = await centerOf(nodeEl(kA));
  const [bx, by] = await centerOf(nodeEl(kB));
  await page.mouse.move((ax + bx) / 2, (ay + by) / 2);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -100);
  await page.waitForTimeout(150);
  await centerOnScreen(nodeEl(kA), nodeEl(kB));
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${SHOTS}/sides-1.png` });
  await page.click("#fitBtn");

  // 3) Inspetor da seta recém-criada: trocar a entrada para a esquerda; Ctrl+Z volta.
  r.inspector = { from: await page.inputValue('[data-field="edge.fromSide"]'), to: await page.inputValue('[data-field="edge.toSide"]') };
  await page.selectOption('[data-field="edge.toSide"]', "left");
  w = await ws(); ab = edgeBetween(w, kA, kB);
  ends = await endsOf(ab.id);
  r.toLeft = { toSide: ab.toSide, end: ends.end, expected: [L[kB].x, L[kB].y + 46] };
  if (ab.toSide !== "left" || !near(ends.end, r.toLeft.expected)) fail("trocar a entrada para a esquerda não redesenhou a seta");
  await page.keyboard.press("Meta+z");
  w = await ws(); r.toLeftUndo = edgeBetween(w, kA, kB).toSide;
  if (r.toLeftUndo !== "top") fail("Ctrl+Z não desfez a troca de lado");

  // 4) Arrastar B: a seta acompanha (continua no topo de B).
  [x, y] = await centerOf(nodeEl(kB));
  await page.waitForTimeout(500);
  await page.keyboard.down("Alt");
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 160, y + 60, { steps: 6 }); await page.mouse.up();
  await page.keyboard.up("Alt");
  w = await ws(); L = layout(w); ab = edgeBetween(w, kA, kB);
  ends = await endsOf(ab.id);
  r.follows = { b: L[kB], end: ends.end };
  if (!near(ends.end, [L[kB].x + 121, L[kB].y])) fail("a seta não acompanhou o card arrastado");

  // 5) SVG exportado usa o tamanho fixo (os retângulos do SVG têm 94 px).
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#svgBtn")]);
  const svg = fs.readFileSync(await dl.path(), "utf8");
  r.svgPath = svg.includes(`M ${L[kA].x + 121} ${L[kA].y + 94} C`);
  if (!r.svgPath) fail("o SVG não traz a seta saindo de baixo de A");

  // 6) Soltar no corpo do card: saída fixa, entrada automática. (Reenquadra: B foi arrastado para a borda.)
  await page.click("#fitBtn");
  await page.mouse.move(5, 5);
  await dragLink(portOf(kB, "right"), nodeEl(kA).locator(".name"));
  w = await ws();
  const ba = edgeBetween(w, kB, kA);
  r.bodyDrop = ba ? { fromSide: ba.fromSide, toSide: ba.toSide ?? "(automático)" } : null;
  if (!ba || ba.fromSide !== "right" || ba.toSide) fail("soltar no corpo deveria deixar a entrada automática");

  // 7) Modo Conectar: clica A, depois a porta da esquerda de T → entrada fixa, saída automática.
  await page.keyboard.press("Escape");
  await page.click('[data-mode="connect"]');
  [x, y] = await centerOf(nodeEl(kA)); await page.mouse.click(x, y);
  [x, y] = await centerOf(nodeEl(kT)); await page.mouse.move(x, y);
  [x, y] = await centerOf(portOf(kT, "left")); await page.mouse.click(x, y);
  await page.click('[data-mode="pointer"]');
  w = await ws();
  const at = edgeBetween(w, kA, kT);
  r.connectMode = at ? { fromSide: at.fromSide ?? "(automático)", toSide: at.toSide } : null;
  if (!at || at.toSide !== "left" || at.fromSide) fail("modo Conectar com porta não fixou a entrada");

  // 8) Automático nos dois lados apaga os campos e volta à regra antiga.
  await page.keyboard.press("Escape");
  await clickEdge(ab.id);
  await page.selectOption('[data-field="edge.fromSide"]', "auto");
  await page.selectOption('[data-field="edge.toSide"]', "auto");
  w = await ws(); L = layout(w); ab = edgeBetween(w, kA, kB);
  ends = await endsOf(ab.id);
  const autoStarts = [[L[kA].x + 242, L[kA].y + 46], [L[kA].x + 121, L[kA].y + hA], [L[kA].x + 121, L[kA].y]];
  r.backToAuto = { hasFrom: "fromSide" in ab, hasTo: "toSide" in ab, start: ends.start };
  if (r.backToAuto.hasFrom || r.backToAuto.hasTo || !autoStarts.some((p) => near(p, ends.start))) fail("Automático não voltou à regra antiga");

  // 9) Recarregar mantém os lados.
  await page.reload(); await page.waitForSelector(".node");
  w = await ws();
  r.reload = { ba: edgeBetween(w, kB, kA)?.fromSide, at: edgeBetween(w, kA, kT)?.toSide };
  if (r.reload.ba !== "right" || r.reload.at !== "left") fail("recarregar perdeu os lados");

  // 10) Importar backup com lado inválido: o lado inválido some (vira automático); o válido fica.
  w.graph.edges.find((e) => e.from === kB && e.to === kA).toSide = "diagonal";
  w.graph.edges.find((e) => e.from === kA && e.to === kT).fromSide = "auto";
  const file = path.join(SHOTS, "sides-import.json");
  fs.writeFileSync(file, JSON.stringify(w));
  await page.setInputFiles("#importFile", file);
  await page.waitForTimeout(400);
  w = await ws();
  const ba2 = edgeBetween(w, kB, kA), at2 = edgeBetween(w, kA, kT);
  r.importSanitized = { baFrom: ba2?.fromSide, baTo: ba2?.toSide ?? "(ausente)", atFrom: at2?.fromSide ?? "(ausente)", atTo: at2?.toSide };
  if (ba2?.fromSide !== "right" || ba2?.toSide !== undefined || at2?.fromSide !== undefined || at2?.toSide !== "left") fail("a importação não limpou os lados inválidos");
  fs.rmSync(file);
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(JSON.stringify(r, null, 1), "\nerrors:", errors);
await browser.close();
