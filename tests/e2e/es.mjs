import { chromium } from "playwright-core";
const [ROOT, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 } })).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", (d) => d.accept());
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
console.log("cards:", await page.$$eval('#nodes .node[data-kind="semantic"]', (ns) => ns.slice(-4).map((n) => n.dataset.es + " " + getComputedStyle(n).backgroundColor)));
console.log("hint:", (await page.textContent(".es-hint"))?.trim());
const sel = await page.$eval(".node.selected", (n) => n.dataset.node);
await page.screenshot({ path: `${SHOTS}/es-1.png` });
// trocar tipo semântico de um evento para Comando -> cor muda
await page.click('[data-focus-scene="preconsulta"]');
const ev = page.locator('.node[data-kind="event"]').first(); const b = await ev.boundingBox();
await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
console.log("evento antes:", await ev.getAttribute("data-es"));
await page.selectOption('[data-field="semanticType"]', "Comando");
console.log("evento depois:", await page.locator('.node[data-kind="event"]').first().getAttribute("data-es"));
await page.keyboard.press("Meta+z");
console.log("após undo:", await page.locator('.node[data-kind="event"]').first().getAttribute("data-es"));
await page.screenshot({ path: `${SHOTS}/es-2.png` });
// legenda: recolher, clicar não deve criar pan nem modal, persiste após reload
await page.click("[data-legend-toggle]");
const collapsed1 = await page.$eval("#esLegend", (e) => e.classList.contains("collapsed"));
await page.waitForTimeout(500); await page.reload(); await page.waitForSelector(".node");
const collapsed2 = await page.$eval("#esLegend", (e) => e.classList.contains("collapsed"));
await page.dblclick("#esLegend"); const modalOpen = await page.$eval("#modal", (m) => m.open);
console.log({ collapsed1, collapsed2, modalOpenAfterDblclickOnLegend: modalOpen });
await page.click("[data-legend-toggle]");
await page.click("[data-focus-all]");
console.log("legenda mapa completo:", await legend());
await page.screenshot({ path: `${SHOTS}/es-3.png` });
console.log("errors:", errors);
await browser.close();
