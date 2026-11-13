import { chromium } from "playwright-core";
import { openApp } from "./target.mjs";
const [, FIX] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext()).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", (d) => d.accept());
await openApp(page); await page.waitForSelector(".node");
await page.setInputFiles("#importFile", FIX); await page.waitForTimeout(400);
const w = await page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const h = w.decisions.find((d) => d.title === "Quem valida o laudo?");
const r = {
  boxesLeft: w.semanticNodes.filter((n) => n.semanticType === "Hotspot").length,
  promoted: h && { id: h.id, resolution: h.resolution, status: h.status },
  edgeRekeyed: w.graph.edges.find((e) => e.id === "rbox")?.to,
  layoutRekeyed: w.graph.layouts.all?.["hotspot:" + h?.id],
  typeInList: w.elementTypes.includes("Hotspot"),
};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
if (r.boxesLeft !== 0) fail(`caixas do tipo Hotspot deveriam virar hotspot: sobraram ${r.boxesLeft}`);
if (!h) fail("hotspot promovido não encontrado");
if (h && r.edgeRekeyed !== "hotspot:" + h.id) fail(`seta não foi religada ao hotspot: ${r.edgeRekeyed}`);
if (!r.layoutRekeyed) fail("posição da caixa não passou para o hotspot");
if (r.typeInList) fail("Hotspot continua na lista de tipos de caixa livre");
// modal: tipo "Hotspot" digitado em caixa livre vira hotspot
await page.keyboard.press("Escape"); await page.keyboard.press("n");
await page.click('[data-modal-type="semantic"]'); await page.fill("#newName", "Risco X"); await page.fill("#newCustomSemantic", "Hotspot"); await page.click("#saveNew");
const w2 = await page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
r.modalCoerced = !!w2.decisions.find((d) => d.title === "Risco X");
r.semanticCreated = !!w2.semanticNodes.find((n) => n.name === "Risco X");
if (!r.modalCoerced || r.semanticCreated) fail("tipo Hotspot digitado no modal deveria criar hotspot, não caixa livre");
await page.keyboard.press("n"); await page.click('[data-modal-type="hotspot"]');
r.hotspotModalHasSemanticSelect = await page.locator('[data-field="new.semanticType"]').count();
if (r.hotspotModalHasSemanticSelect !== 0) fail("modal de hotspot não deveria oferecer tipo semântico");
console.log(r, "\nerrors:", errors);
await browser.close();
