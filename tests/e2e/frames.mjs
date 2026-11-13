// #11 Moldura: criar com F em volta da seleção, renomear, redimensionar, arrastar levando os cards,
// fundo transparente ao mouse, inspetor, SVG, recorte, Organizar, Camadas, reload, excluir e desfazer.
import { chromium } from "playwright-core";
import { appUrl } from "./target.mjs";
import fs from "node:fs";
const [, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1540, height: 920 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("dialog", (d) => d.accept());
await page.goto(appUrl()); await page.waitForSelector(".node");
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const layout = (w) => w.graph.layouts["lanes|scene:preconsulta"] ?? w.graph.layouts["timeline|scene:preconsulta"];
const camera = () => page.$eval("#world", (el) => el.style.transform);
const zoomOf = async () => Number((await camera()).match(/scale\(([\d.]+)\)/)[1]);
const center = async (loc) => { const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const card = (name) => page.locator(".node", { hasText: name }).first();
const EV_A = "PréConsultaIniciada", EV_B = "PreConsultaFinalizada";
const TITLE = "Fluxo da pré-consulta";
const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
const drag = async (x, y, dx, dy) => {
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 }); await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
};

try {
  await page.click('[data-focus-scene="preconsulta"]'); await page.keyboard.press("Escape");
  let w = await ws();
  const evKey = (name) => "event:" + w.events.find((e) => e.name === name).id;
  const kA = evKey(EV_A), kB = evKey(EV_B);

  // 1) F com dois cards selecionados: a moldura nasce em volta deles, com o título em edição.
  let [x, y] = await center(card(EV_A)); await page.mouse.click(x, y);
  [x, y] = await center(card(EV_B));
  await page.keyboard.down("Shift"); await page.mouse.click(x, y); await page.keyboard.up("Shift");
  await page.keyboard.press("f");
  await page.keyboard.type(TITLE); await page.keyboard.press("Enter");
  w = await ws();
  const frame = w.frames[0];
  const fk = "frame:" + frame?.id;
  const L = layout(w);
  const inside = (k) => L[k].x >= L[fk].x && L[k].y >= L[fk].y && L[k].x + 242 <= L[fk].x + frame.w && L[k].y + 94 <= L[fk].y + frame.h;
  r.create = { count: w.frames.length, title: frame?.title, scope: frame?.scope, wrapsBoth: !!frame && inside(kA) && inside(kB), badge: await page.textContent(".frame-count") };
  if (r.create.count !== 1 || r.create.title !== TITLE || !r.create.wrapsBoth || r.create.scope !== "scene:preconsulta") fail("moldura não nasceu em volta da seleção");
  await page.screenshot({ path: `${SHOTS}/frames-1.png` });

  // 2) Duplo clique no título renomeia; Ctrl+Z volta o nome.
  [x, y] = await center(page.locator(".frame-head .name"));
  await page.mouse.dblclick(x, y);
  await page.keyboard.type("Pré-consulta"); await page.keyboard.press("Enter");
  w = await ws(); r.rename = w.frames[0].title;
  await page.keyboard.press("Meta+z");
  w = await ws(); r.renameUndo = w.frames[0].title;
  if (r.rename !== "Pré-consulta" || r.renameUndo !== TITLE) fail("renomear/desfazer a moldura falhou");

  // 3) Alça redimensiona; Ctrl+Z volta o tamanho.
  const z = await zoomOf();
  const size0 = { w: w.frames[0].w, h: w.frames[0].h };
  [x, y] = await center(page.locator(".frame-resize"));
  await drag(x, y, 100, 60);
  w = await ws();
  r.resize = { dw: w.frames[0].w - size0.w, dh: w.frames[0].h - size0.h, expected: [Math.round(100 / z), Math.round(60 / z)] };
  if (Math.abs(r.resize.dw - r.resize.expected[0]) > 2 || Math.abs(r.resize.dh - r.resize.expected[1]) > 2) fail("redimensionar a moldura falhou");
  await page.keyboard.press("Meta+z");
  w = await ws(); r.resizeUndo = w.frames[0].w === size0.w && w.frames[0].h === size0.h;
  if (!r.resizeUndo) fail("Ctrl+Z não desfez o redimensionamento");

  // 4) Arrastar pelo título leva os cards de dentro; o que está fora fica; Ctrl+Z desfaz tudo.
  const before = JSON.parse(JSON.stringify(layout(w)));
  [x, y] = await center(page.locator(".frame-head"));
  // Uma seta cena → evento cruza a faixa do título: o título precisa vencer a seta.
  r.headHit = await page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest(".frame-head"), [x, y]);
  if (!r.headHit) fail("a faixa do título não recebe o clique");
  await drag(x, y, 80, 50);
  w = await ws();
  const after = layout(w);
  const delta = (k) => [after[k].x - before[k].x, after[k].y - before[k].y];
  r.dragWithContent = { frame: delta(fk), a: delta(kA), b: delta(kB), sceneStill: delta("scene:preconsulta").every((v) => v === 0) };
  const same = (p, q) => p[0] === q[0] && p[1] === q[1];
  if (!same(r.dragWithContent.frame, r.dragWithContent.a) || !same(r.dragWithContent.frame, r.dragWithContent.b) || r.dragWithContent.frame[0] === 0) fail("arrastar a moldura não levou os cards");
  if (!r.dragWithContent.sceneStill) fail("arrastar a moldura moveu card de fora");
  await page.keyboard.press("Meta+z");
  w = await ws();
  r.dragUndo = [fk, kA, kB].every((k) => layout(w)[k].x === before[k].x && layout(w)[k].y === before[k].y);
  if (!r.dragUndo) fail("Ctrl+Z não desfez o arraste da moldura");

  // 5) O fundo da moldura deixa passar o mouse: arrastar move a tela; duplo clique abre "criar elemento".
  const fb = await page.locator(".frame").boundingBox();
  let spot = null;
  for (let gy = fb.y + fb.height - 8; gy > fb.y + 40 && !spot; gy -= 6)
    for (let gx = fb.x + 8; gx < fb.x + fb.width - 24 && !spot; gx += 6) {
      const free = await page.evaluate(([px, py]) => {
        const el = document.elementFromPoint(px, py);
        return !!el && !el.closest("[data-node],[data-edge],.stage-over,.lane-gutter,#esLegend,.zoomhud");
      }, [gx, gy]);
      if (free) spot = [gx, gy];
    }
  if (!spot) throw new Error("sem ponto livre dentro da moldura");
  const cam0 = await camera(); const framePos0 = JSON.stringify(layout(await ws())[fk]);
  await drag(spot[0], spot[1], 40, 25);
  r.bodyPans = { cameraMoved: (await camera()) !== cam0, frameStill: JSON.stringify(layout(await ws())[fk]) === framePos0 };
  if (!r.bodyPans.cameraMoved || !r.bodyPans.frameStill) fail("fundo da moldura capturou o arraste");
  const fb2 = await page.locator(".frame").boundingBox();
  const spot2 = [spot[0] + (fb2.x - fb.x), spot[1] + (fb2.y - fb.y)];
  await page.mouse.dblclick(spot2[0], spot2[1]);
  r.bodyDblClickCreates = await page.$eval("#modal", (d) => d.open);
  if (r.bodyDblClickCreates) await page.keyboard.press("Escape");
  else fail("duplo clique no fundo da moldura não abriu a criação");

  // 6) Inspetor: selecionar conteúdo e trocar a cor (com undo).
  [x, y] = await center(page.locator(".frame-head")); await page.mouse.click(x, y);
  r.inspectorTitle = await page.textContent("#inspectTitle");
  await page.click("[data-frame-select-content]");
  r.selectContent = { title: await page.textContent("#inspectTitle"), selected: await page.$$eval(".node.selected", (n) => n.map((e) => e.dataset.node)) };
  if (!r.selectContent.selected.includes(kA) || !r.selectContent.selected.includes(kB)) fail("selecionar conteúdo não pegou os cards");
  await page.waitForTimeout(500); // outro clique no mesmo ponto em < 450 ms seria duplo clique (renomear)
  [x, y] = await center(page.locator(".frame-head")); await page.mouse.click(x, y);
  const color0 = (await ws()).frames[0].color;
  await page.click('[data-frame-color]:not(.is-active)');
  w = await ws(); r.color = { changed: w.frames[0].color !== color0 };
  await page.click("#inspectBody .hint");
  await page.keyboard.press("Meta+z");
  w = await ws(); r.color.undo = w.frames[0].color === color0;
  if (!r.color.changed || !r.color.undo) fail("cor da moldura/undo falhou");

  // 7) SVG exportado traz a moldura.
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#svgBtn")]);
  const svg = fs.readFileSync(await dl.path(), "utf8");
  r.svg = { title: svg.includes(TITLE), fill: svg.includes(`fill="${color0}" fill-opacity`) };
  if (!r.svg.title || !r.svg.fill) fail("SVG sem a moldura");

  // 8) Só aparece no recorte em que foi criada.
  await page.click('[data-focus-chapter="consulta"]');
  r.otherScope = await page.locator(".frame").count();
  await page.click('[data-focus-scene="preconsulta"]'); await page.keyboard.press("Escape");
  r.backScope = await page.locator(".frame").count();
  if (r.otherScope !== 0 || r.backScope !== 1) fail("moldura vazou para outro recorte");

  // 9) Organizar não move a moldura; em Camadas ela continua lá.
  w = await ws(); const posBeforeOrganize = JSON.stringify(layout(w)[fk]);
  await page.click("#layoutBtn");
  w = await ws(); r.organizeKeepsFrame = JSON.stringify(layout(w)[fk]) === posBeforeOrganize;
  if (!r.organizeKeepsFrame) fail("Organizar moveu a moldura");
  await page.click('[data-layout="layers"]');
  r.inLayers = await page.locator(".frame").count();
  await page.click('[data-layout="timeline"]');
  if (r.inLayers !== 1) fail("moldura sumiu em Camadas");

  // 10) Recarregar mantém a moldura.
  await page.reload(); await page.waitForSelector(".frame");
  r.reload = await page.textContent(".frame-head .name");
  if (r.reload !== TITLE) fail("moldura não sobreviveu ao reload");

  // 11) Del exclui só a moldura (os cards ficam); Ctrl+Z devolve.
  [x, y] = await center(page.locator(".frame-head")); await page.mouse.click(x, y);
  const eventsBefore = (await ws()).events.length;
  await page.keyboard.press("Delete");
  w = await ws(); r.delete = { frames: w.frames.length, eventsKept: w.events.length === eventsBefore };
  await page.keyboard.press("Meta+z");
  w = await ws(); r.deleteUndo = w.frames.length;
  if (r.delete.frames !== 0 || !r.delete.eventsKept || r.deleteUndo !== 1) fail("excluir moldura/desfazer falhou");

  // 12) Esc no título de uma moldura nova descarta a criação.
  [x, y] = await center(card(EV_A)); await page.mouse.click(x, y);
  await page.keyboard.press("f"); await page.keyboard.press("Escape");
  w = await ws(); r.escDiscards = w.frames.length;
  if (r.escDiscards !== 1) fail("Esc não descartou a moldura nova");

  // 13) Seta solta sobre a moldura não liga nada (a moldura não tem setas).
  const edgesBefore = w.graph.edges.length;
  const port = page.locator(`[data-node="${kA}"] .port.right`);
  const [px, py] = await center(port);
  const [hx, hy] = await center(page.locator(".frame-head .frame-count"));
  await page.mouse.move(px, py); await page.mouse.down(); await page.mouse.move(hx, hy, { steps: 6 }); await page.mouse.up();
  const modalOpen = await page.$eval("#modal", (d) => d.open);
  if (modalOpen) await page.keyboard.press("Escape");
  w = await ws(); r.noEdgeToFrame = { edgesSame: w.graph.edges.length === edgesBefore, noFrameEdge: !w.graph.edges.some((e) => e.from.startsWith("frame:") || e.to.startsWith("frame:")) };
  if (!r.noEdgeToFrame.edgesSame || !r.noEdgeToFrame.noFrameEdge) fail("seta ligou na moldura");
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(JSON.stringify(r, null, 1), "\nerrors:", errors);
await browser.close();
