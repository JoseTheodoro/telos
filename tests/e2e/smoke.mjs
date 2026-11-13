// Roteiro de ponta a ponta no layout em camadas: criar, editar, ligar, desfazer, buscar, recarregar e limpar.
import { chromium } from "playwright-core";

const ROOT = process.argv[2];
const SHOTS = process.argv[3];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1540, height: 920 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && !m.text().includes("fonts.g") && errors.push("console: " + m.text()));
page.on("dialog", (d) => d.accept());

const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const snap = async (label) => ({
  label,
  vis: await page.textContent("#visCount"),
  counts: await page.textContent("#counts"),
  nodes: await page.locator("#nodes .node").count(),
  edges: await page.locator("#edgePaths g[data-edge]").count(),
  inspect: (await page.textContent("#inspectTitle"))?.trim(),
  undoDisabled: await page.locator("#undo").isDisabled(),
});
const visiblePointOn = async (loc) => {
  const key = await loc.getAttribute("data-node");
  const point = await page.evaluate((k) => {
    const box = document.querySelector(`#nodes > [data-node="${k}"]`).getBoundingClientRect();
    for (let y = box.top + 4; y < box.bottom - 2; y += 4)
      for (let x = box.left + 4; x < box.right - 2; x += 4)
        if (document.elementFromPoint(x, y)?.closest(".node")?.dataset.node === k) return [x, y];
    return null;
  }, key);
  if (!point) throw new Error(`card ${key} está todo coberto por outro elemento`);
  return point;
};
const out = [];
const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };

try {
  await page.goto(`file://${ROOT}/dist/index.html`);
  await page.waitForSelector(".node");
  await page.click('[data-layout="layers"]');
  out.push(await snap("inicial"));
  await page.screenshot({ path: `${SHOTS}/smoke-1-inicial.png` });

  await page.click("[data-focus-all]");
  const fullMap = await snap("mapa completo");
  out.push(fullMap);

  await page.click('[data-focus-scene="preconsulta"]');
  const scene = await snap("cena preconsulta");
  out.push(scene);
  if (!(fullMap.nodes > scene.nodes)) fail("o mapa completo deveria mostrar mais cards que o recorte da cena");

  await page.keyboard.press("Escape");
  await page.keyboard.press("n");
  await page.fill("#newName", "Sinais vitais aferidos (teste)");
  await page.click("#saveNew");
  const created = await snap("evento criado");
  out.push(created);
  if (created.nodes !== scene.nodes + 1 || created.inspect !== "Sinais vitais aferidos (teste)") fail("N + salvar deveria criar o evento no recorte e selecioná-lo");

  await page.fill('[data-field="name"]', "Sinais vitais registrados");
  await page.locator('[data-field="name"]').blur();
  const renamed = await snap("nome editado");
  out.push(renamed);
  if (renamed.inspect !== "Sinais vitais registrados") fail(`renomear pelo inspetor: ${renamed.inspect}`);

  const ev = page.locator('.node[data-kind="event"]', { hasText: "Sinais vitais registrados" });
  const target = page.locator('#nodes > .node[data-kind="system"]').first();
  const targetKey = await target.getAttribute("data-node");
  const evKey = await ev.getAttribute("data-node");
  const eb = await ev.boundingBox();
  await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
  const ob = await ev.locator(".port.right").boundingBox();
  const tb = await target.boundingBox();
  const [px, py] = [ob.x + ob.width / 2, ob.y + ob.height / 2];
  await page.mouse.move(px, py);
  const onPort = await page.evaluate(([qx, qy]) => !!document.elementFromPoint(qx, qy)?.matches(".port"), [px, py]);
  if (!onPort) throw new Error("o mouse não está sobre a porta de origem");
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 8 });
  await page.mouse.up();
  const linked = await snap("seta criada");
  out.push(linked);
  const newEdge = (await ws()).graph.edges.find((e) => e.from === evKey && e.to === targetKey);
  if (!newEdge || linked.edges !== renamed.edges + 1 || !linked.inspect?.includes("Conexão")) fail("arrastar da porta até o card deveria criar e selecionar a seta");

  await page.click('[data-edge-color="#337fc6"]');
  r.edgeColor = (await ws()).graph.edges.find((e) => e.id === newEdge?.id)?.color;
  out.push(await snap("cor aplicada"));
  if (r.edgeColor !== "#337fc6") fail(`cor da paleta não foi gravada na seta: ${r.edgeColor}`);

  await page.click("[data-legend-toggle]");
  await page.click("#quickStateBtn");
  await page.fill("#newName", "Paciente triado");
  await page.click("#saveNew");
  const stateCreated = await snap("estado criado");
  out.push(stateCreated);
  const st = page.locator('.node[data-kind="semantic"]', { hasText: "Paciente triado" });
  if ((await st.count()) !== 1 || stateCreated.inspect !== "Paciente triado") fail("+ Estado deveria criar e selecionar a caixa");

  const stKey = await st.getAttribute("data-node");
  const positionOf = async () => (await ws()).graph.layouts.all?.[stKey];
  const before = await positionOf();
  const [sx, sy] = await visiblePointOn(st);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx - 60, sy - 60, { steps: 6 });
  await page.mouse.up();
  const after = await positionOf();
  out.push({ label: "nó arrastado", before, after });
  if (!after || (before && after.x === before.x && after.y === before.y)) fail("arrastar a caixa deveria gravar a nova posição");

  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+z");
  await page.keyboard.press("Meta+z");
  out.push(await snap("undo x2"));
  r.stateAfterUndo = await st.count();
  if (r.stateAfterUndo !== 0) fail("dois Ctrl+Z deveriam desfazer o arraste e a criação da caixa");
  await page.keyboard.press("Meta+Shift+z");
  out.push(await snap("redo"));
  r.stateAfterRedo = await st.count();
  if (r.stateAfterRedo !== 1) fail("Ctrl+Shift+Z deveria refazer a criação da caixa");

  // Dois toques no mesmo card em menos de 450 ms viram duplo clique (DOUBLE_TAP_MS em interactions.ts).
  await page.waitForTimeout(500);
  await page.mouse.click(...(await visiblePointOn(st)));
  await page.keyboard.press("Delete");
  out.push(await snap("estado excluído"));
  r.stateAfterDelete = (await ws()).semanticNodes.some((n) => n.name === "Paciente triado");
  if (r.stateAfterDelete) fail("Delete deveria excluir a caixa selecionada");

  await page.click('[data-tab="inventory"]');
  await page.fill("#search", "laudo");
  r.found = await page.locator(".inventory-item").count();
  if (!r.found) fail("busca por 'laudo' no catálogo não encontrou nada");
  await page.locator(".inventory-item").first().click();
  const focused = await snap("foco via catálogo");
  out.push(focused);
  if (focused.inspect === "Selecione um elemento") fail("clicar no item do catálogo deveria selecionar o card");

  const zoomBefore = await page.textContent("#zoomLabel");
  await page.click("#layoutBtn");
  await page.click("#fitBtn");
  const zoomFit = await page.textContent("#zoomLabel");
  await page.click("#zoomIn");
  r.zoom = { before: zoomBefore, fit: zoomFit, in: await page.textContent("#zoomLabel") };
  out.push({ label: "zoom", ...r.zoom });
  if (!(Number.parseInt(r.zoom.in, 10) > Number.parseInt(zoomFit, 10))) fail(`zoom + depois de enquadrar: ${JSON.stringify(r.zoom)}`);

  await page.click('[data-tab="decisions"]');
  await page.locator('[data-decision], [data-select-node^="hotspot:"]').first().click();
  const hotspot = await snap("hotspot");
  out.push(hotspot);
  if (hotspot.inspect === "Selecione um elemento") fail("clicar no hotspot da lista deveria selecioná-lo");

  await page.reload();
  await page.waitForSelector(".node");
  const reloaded = await snap("após reload");
  out.push(reloaded);
  await page.screenshot({ path: `${SHOTS}/smoke-2-final.png` });
  if (reloaded.counts !== hotspot.counts || reloaded.vis !== hotspot.vis) fail("recarregar deveria manter o mapa e o recorte");

  await page.click("#clearCanvasBtn");
  await page.fill("#confirmWipeInput", "APAGAR");
  await page.click("#executeWipe");
  const wiped = await snap("canvas limpo");
  out.push(wiped);
  r.emptyVisible = await page.locator("#emptyStage").isVisible();
  if (wiped.nodes !== 0 || !r.emptyVisible) fail("Limpar canvas deveria esvaziar o canvas e mostrar o estado vazio");
} catch (err) { r.FAILED = err.message.split("\n")[0]; }

await browser.close();
for (const step of out) console.log(JSON.stringify(step));
console.log(r, "\nerrors:", errors);
