// Roda o mesmo roteiro na v1.5 original e no build novo e compara os resultados.
import { chromium } from "playwright-core";

const ROOT = process.argv[2];
const SHOTS = process.argv[3];
const targets = {
  legacy: `file://${ROOT}/legacy/PEP_Atlas_Studio_v1.5.html`,
  build: `file://${ROOT}/dist/index.html`,
};

const browser = await chromium.launch({ channel: "chrome", headless: true });

async function scenario(name, url) {
  const ctx = await browser.newContext({ viewport: { width: 1540, height: 920 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("fonts.g") && errors.push("console: " + m.text()));
  page.on("dialog", (d) => d.accept());
  await page.goto(url);
  await page.waitForSelector(".node");
  const snap = async (label) => ({
    label,
    vis: await page.textContent("#visCount"),
    counts: await page.textContent("#counts"),
    footer: await page.textContent("#footerLeft"),
    nodes: await page.locator("#nodes .node").count(),
    edges: await page.locator("#edgePaths g[data-edge]").count(),
    inspect: (await page.textContent("#inspectTitle"))?.trim(),
    undoDisabled: await page.locator("#undo").isDisabled(),
  });
  const out = [];
  out.push(await snap("inicial"));
  await page.screenshot({ path: `${SHOTS}/${name}-1-inicial.png` });

  // Mapa completo
  await page.click("[data-focus-all]");
  out.push(await snap("mapa completo"));

  // Foco numa cena pela árvore
  await page.click('[data-focus-scene="preconsulta"]');
  out.push(await snap("cena preconsulta"));

  // Criar evento pelo modal (N)
  await page.keyboard.press("Escape");
  await page.keyboard.press("n");
  await page.fill("#newName", "Sinais vitais aferidos (teste)");
  await page.click("#saveNew");
  out.push(await snap("evento criado"));

  // Editar nome no inspetor
  await page.fill('[data-field="name"]', "Sinais vitais registrados");
  await page.locator('[data-field="name"]').blur();
  out.push(await snap("nome editado"));

  // Criar caixa livre Estado
  await page.click("#quickStateBtn");
  await page.fill("#newName", "Paciente triado");
  await page.click("#saveNew");
  out.push(await snap("estado criado"));

  // Conectar arrastando: porta out do evento novo → nó do estado
  const ev = page.locator('.node[data-kind="event"]', { hasText: "Sinais vitais registrados" });
  const st = page.locator('.node[data-kind="semantic"]', { hasText: "Paciente triado" });
  await ev.scrollIntoViewIfNeeded();
  const outPort = ev.locator(".port.out");
  const ob = await outPort.boundingBox();
  const sb = await st.boundingBox();
  if (ob && sb) {
    await page.mouse.move(ob.x + ob.width / 2, ob.y + ob.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb.x + 40, sb.y + 40, { steps: 8 });
    await page.mouse.up();
  }
  out.push(await snap("seta criada"));

  // Cor da seta pela paleta
  if ((await page.textContent("#inspectTitle"))?.includes("Conexão")) {
    await page.click('[data-edge-color="#337fc6"]');
  }
  out.push(await snap("cor aplicada"));

  // Arrastar um nó
  const nb = await st.boundingBox();
  if (nb) {
    await page.mouse.move(nb.x + 120, nb.y + 50);
    await page.mouse.down();
    await page.mouse.move(nb.x + 220, nb.y + 150, { steps: 6 });
    await page.mouse.up();
  }
  out.push(await snap("nó arrastado"));

  // Undo x2, Redo x1
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+z");
  await page.keyboard.press("Meta+z");
  out.push(await snap("undo x2"));
  await page.keyboard.press("Meta+Shift+z");
  out.push(await snap("redo"));

  // Excluir o estado selecionado
  if (await st.count()) {
    await st.click();
    await page.keyboard.press("Delete");
  } else out.push({ label: "estado não visível após undo/redo" });
  out.push(await snap("estado excluído"));

  // Catálogo + busca
  await page.click('[data-tab="inventory"]');
  await page.fill("#search", "laudo");
  const found = await page.locator(".inventory-item").count();
  out.push({ label: "busca 'laudo'", found });
  if (found) await page.locator(".inventory-item").first().click();
  out.push(await snap("foco via catálogo"));

  // Organizar + enquadrar + zoom
  await page.click("#layoutBtn");
  await page.click("#fitBtn");
  await page.click("#zoomIn");
  out.push({ label: "zoom", zoom: await page.textContent("#zoomLabel") });

  // Hotspots
  await page.click('[data-tab="decisions"]');
  await page.locator("[data-decision], [data-select-node^=\"hotspot:\"]").first().click();
  out.push(await snap("hotspot"));

  // Persistência: recarregar
  await page.reload();
  await page.waitForSelector(".node");
  out.push(await snap("após reload"));
  await page.screenshot({ path: `${SHOTS}/${name}-2-final.png` });

  // Limpar canvas
  await page.click("#clearCanvasBtn");
  await page.fill("#confirmWipeInput", "APAGAR");
  await page.click("#executeWipe");
  out.push(await snap("canvas limpo"));
  out.push({ label: "empty visível", empty: await page.locator("#emptyStage").isVisible() });

  await ctx.close();
  return { out, errors };
}

const results = {};
for (const [name, url] of Object.entries(targets)) results[name] = await scenario(name, url);
await browser.close();

const L = results.legacy.out;
const B = results.build.out;
let diffs = 0;
for (let i = 0; i < Math.max(L.length, B.length); i++) {
  const a = JSON.stringify(L[i]);
  const b = JSON.stringify(B[i]);
  const same = a === b;
  if (!same) diffs++;
  console.log(`${same ? "OK  " : "DIFF"} ${JSON.stringify(B[i])}`);
  if (!same) console.log("   legacy:", a, "\n   build: ", b);
}
console.log("\nErros legacy:", results.legacy.errors);
console.log("Erros build:", results.build.errors);
console.log(`\n${diffs} diferenças`);
