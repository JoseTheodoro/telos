import { chromium } from "playwright-core";
const [ROOT, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 } })).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", (d) => d.accept());
const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
await page.goto(`file://${ROOT}/dist/index.html`); await page.waitForSelector(".node");
await page.click('[data-focus-scene="preconsulta"]');
const legend = async () => page.$$eval("#esLegend li", (ls) => ls.map((l) => l.textContent));
console.log("legenda cena:", await legend());
// cria Comando e Política como caixas livres
for (const [name, type] of [["Registrar sinais vitais", "Comando"], ["Sempre que sinais alterados, alertar médico", "Política"], ["Enfermeira", "Ator"], ["Quando nasce o encounter?", "Risco"]]) {
  await page.keyboard.press("Escape"); await page.keyboard.press("n");
  await page.click('[data-modal-type="semantic"]');
  await page.fill("#newName", name); await page.selectOption('[data-field="new.semanticType"]', type);
  await page.click("#saveNew");
}
const cards = await page.$$eval('#nodes .node[data-kind="semantic"]', (ns) => ns.slice(-4).map((n) => n.dataset.es + " " + getComputedStyle(n).backgroundColor));
console.log("cards:", cards);
r.createdEs = cards.map((c) => c.split(" ")[0]).join(",");
if (r.createdEs !== "comando,politica,ator,hotspot") fail(`tipos ES das caixas criadas: ${r.createdEs}`);
console.log("hint:", (await page.textContent(".es-hint"))?.trim());
const sel = await page.$eval(".node.selected", (n) => n.dataset.node);
await page.screenshot({ path: `${SHOTS}/es-1.png` });
// trocar tipo semântico de um evento para Comando -> cor muda
await page.click('[data-focus-scene="preconsulta"]');
const ev = page.locator('.node[data-kind="event"]').first(); const b = await ev.boundingBox();
await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
r.eventBefore = await ev.getAttribute("data-es");
await page.selectOption('[data-field="semanticType"]', "Comando");
r.eventAfter = await page.locator('.node[data-kind="event"]').first().getAttribute("data-es");
await page.keyboard.press("Meta+z");
r.eventAfterUndo = await page.locator('.node[data-kind="event"]').first().getAttribute("data-es");
if (r.eventBefore !== "evento" || r.eventAfter !== "comando" || r.eventAfterUndo !== "evento")
  fail(`troca de tipo do evento e undo: ${r.eventBefore} → ${r.eventAfter} → ${r.eventAfterUndo}`);
await page.screenshot({ path: `${SHOTS}/es-2.png` });
// legenda: recolher, clicar não deve criar pan nem modal, persiste após reload
await page.click("[data-legend-toggle]");
const collapsed1 = await page.$eval("#esLegend", (e) => e.classList.contains("collapsed"));
await page.waitForTimeout(500); await page.reload(); await page.waitForSelector(".node");
const collapsed2 = await page.$eval("#esLegend", (e) => e.classList.contains("collapsed"));
await page.dblclick("#esLegend"); const modalOpen = await page.$eval("#modal", (m) => m.open);
Object.assign(r, { collapsed1, collapsed2, modalOpenAfterDblclickOnLegend: modalOpen });
if (!collapsed1) fail("legenda não recolheu");
if (!collapsed2) fail("legenda recolhida não persistiu no reload");
if (modalOpen) fail("duplo clique na legenda abriu o modal de criação");
await page.click("[data-legend-toggle]");
await page.click("[data-focus-all]");
console.log("legenda mapa completo:", await legend());
await page.screenshot({ path: `${SHOTS}/es-3.png` });
console.log(r, "\nerrors:", errors);
await browser.close();
