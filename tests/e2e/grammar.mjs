import { chromium } from "playwright-core";
const [ROOT, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 } })).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", (d) => d.accept());
await page.goto(`file://${ROOT}/dist/index.html`); await page.waitForSelector(".node");
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const toast = () => page.textContent("#toast");
const r = {};
try {
  let w = await ws();
  // 1) seed: nenhum aviso; papéis migrados
  await page.click("[data-focus-all]");
  r.seedWarnings = await page.locator(".edge-caption.off-grammar").count();
  const ed = w.graph.edges.filter((e) => e.from.startsWith("event:") && e.to.startsWith("domain:"));
  r.roles = { total: ed.length, owner: ed.filter((e) => e.role === "owner").length, labeledOwner: ed.filter((e) => e.label.includes("responsável")).length };

  // 2) Fluxo canônico com Tab a partir de um Comando
  await page.click("#quickActionBtn"); await page.selectOption('[data-field="new.semanticType"]', "Comando");
  await page.fill("#newName", "Registrar triagem"); await page.click("#saveNew");
  r.nextButton = (await page.textContent('[data-quick="next"]')).replace(/\s+/g, " ").trim();
  const chain = [];
  for (const name of ["Triagem", "Triagem registrada", "Alertar médico se crítico", "Notificar médico"]) {
    await page.keyboard.press("Tab"); await page.keyboard.press("Meta+a"); await page.keyboard.type(name); await page.keyboard.press("Enter");
  }
  w = await ws();
  const byName = (n) => w.semanticNodes.find((x) => x.name === n);
  const seq = ["Registrar triagem", "Triagem", "Triagem registrada", "Alertar médico se crítico", "Notificar médico"].map(byName);
  for (let i = 0; i < seq.length - 1; i++) {
    const e = w.graph.edges.find((x) => x.from === "semantic:" + seq[i].id && x.to === "semantic:" + seq[i + 1].id);
    chain.push(`${seq[i].semanticType} -[${e?.label}]-> ${seq[i + 1].semanticType}`);
  }
  r.chain = chain;
  r.chainWarnings = await page.locator(".edge-caption.off-grammar").count();
  await page.screenshot({ path: `${SHOTS}/grammar-1.png` });

  // 3) Estado ⇄ Ação
  await page.keyboard.press("Escape");
  await page.click("#quickStateBtn"); await page.fill("#newName", "Aguardando triagem"); await page.click("#saveNew");
  await page.keyboard.press("Tab"); await page.keyboard.press("Meta+a"); await page.keyboard.type("Chamar paciente"); await page.keyboard.press("Enter");
  await page.keyboard.press("Tab"); await page.keyboard.press("Meta+a"); await page.keyboard.type("Em triagem"); await page.keyboard.press("Enter");
  w = await ws();
  const s1 = w.semanticNodes.find((x) => x.name === "Aguardando triagem"), a1 = w.semanticNodes.find((x) => x.name === "Chamar paciente"), s2 = w.semanticNodes.find((x) => x.name === "Em triagem");
  const lab = (x, y) => w.graph.edges.find((e) => e.from === "semantic:" + x.id && e.to === "semantic:" + y.id)?.label;
  r.stateMachine = `${s1.semanticType} -[${lab(s1, a1)}]-> ${a1.semanticType} -[${lab(a1, s2)}]-> ${s2.semanticType}`;

  // 4) Fora do padrão: Evento (Triagem registrada) → Comando (Registrar triagem) pelo modo conectar
  const nodeBox = async (name) => page.locator(".node", { hasText: name }).first().boundingBox();
  await page.keyboard.press("Escape");
  await page.click('[data-tab="inventory"]'); await page.fill("#search", "Triagem registrada"); await page.click('.inventory-item[data-select-node^="semantic:"]');
    await page.screenshot({ path: `${SHOTS}/grammar-dbg.png` });
  r.dbg = { b1: await nodeBox("Triagem registrada"), b2: await nodeBox("Registrar triagem"), zoom: await page.textContent("#zoomLabel"), stage: await page.locator("#stage").boundingBox() };
  await page.keyboard.press("c");
  let b1 = await nodeBox("Triagem registrada"); await page.mouse.click(b1.x + b1.width / 2, b1.y + b1.height / 2);
  let b2 = await nodeBox("Registrar triagem"); await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2);
  r.offToast = await toast();
  r.offCaption = await page.locator(".edge-caption.off-grammar").allTextContents();
  r.offInspector = (await page.textContent(".grammar"))?.replace(/\s+/g, " ").trim();
  await page.screenshot({ path: `${SHOTS}/grammar-2.png` });
  await page.click('[data-grammar-exception="on"]');
  r.afterException = { warnings: await page.locator(".edge-caption.off-grammar").count(), inspector: (await page.textContent(".grammar b")) };
  await page.click('[data-grammar-exception="off"]');
  r.afterUnException = await page.locator(".edge-caption.off-grammar").count();
  await page.keyboard.press("v");

  // 5) "Usar rótulo sugerido"
  w = await ws();
  const okEdge = w.graph.edges.find((e) => e.label === "dispara");
  await page.click('[data-tab="inventory"]');
  r.useLabel = "skip";
  // seleciona a seta pelo inspetor do nó de origem
  r.step = "search"; await page.fill("#search", "Triagem registrada");
  r.items = await page.$$eval(".inventory-item", (xs) => xs.map((x) => x.dataset.selectNode + "|" + x.textContent));
  r.step = "pick"; await page.click('.inventory-item[data-select-node^="semantic:"]');
  r.okEdge = okEdge && `${okEdge.from}->${okEdge.to}`; r.selNow = await page.$eval(".node.selected", (n) => n.dataset.node).catch(() => "none");
  r.step = "inspect";
  const btn = page.locator(`[data-inspect-edge="${okEdge.id}"]`);
  r.btnInfo = { count: await btn.count(), box: await btn.boundingBox().catch(() => null), visible: await btn.isVisible().catch(() => null) };
  await btn.click({ timeout: 4000 });
  await page.fill('[data-field="edge.label"]', "x"); await page.locator('[data-field="edge.label"]').blur();
  await page.click("[data-use-label]");
  r.useLabel = (await ws()).graph.edges.find((e) => e.id === okEdge.id).label;

  // 6) Tab em evento → "precede", sem aviso
  await page.click('[data-tab="journey"]'); await page.click('[data-focus-scene="preconsulta"]');
  await page.click('[data-tab="inventory"]'); await page.fill("#search", "PréConsultaIniciada"); await page.click('.inventory-item[data-select-node^="event:"]');
  const evKey = await page.$eval(".node.selected", (n) => n.dataset.node);
  await page.keyboard.press("Tab"); await page.keyboard.type("Pulseira conferida"); await page.keyboard.press("Enter");
  w = await ws();
  const nev = w.events.find((e) => e.name === "Pulseira conferida");
  r.eventChain = w.graph.edges.find((e) => e.from === evKey && e.to === "event:" + nev.id)?.label;

  // 7) Papel do domínio: trocar para consumidor e renomear seta não quebra o mapeamento
  const edDom = w.graph.edges.find((e) => e.from === evKey && e.to.startsWith("domain:"));
  await page.fill("#search", "PréConsultaIniciada"); await page.click('.inventory-item[data-select-node^="event:"]');
  await page.click(`[data-inspect-edge="${edDom.id}"]`);
  await page.selectOption('[data-field="edge.role"]', "consumer");
  await page.fill('[data-field="edge.label"]', "usa dados de"); await page.locator('[data-field="edge.label"]').blur();
  w = await ws();
  const evId = evKey.split(":")[1];
  r.mapping = { consumers: w.eventMappings[evId].consumerDomainIds, owner: w.eventMappings[evId].domainId, label: w.graph.edges.find((e) => e.id === edDom.id).label };
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(JSON.stringify(r, null, 1), "\nerrors:", errors);
await browser.close();
