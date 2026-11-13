import { chromium } from "playwright-core";
const [ROOT, FIX] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext()).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", (d) => d.accept());
await page.goto(`file://${ROOT}/dist/index.html`); await page.waitForSelector(".node");
await page.setInputFiles("#importFile", FIX); await page.waitForTimeout(400);
const w = await page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const h = w.decisions.find((d) => d.title === "Quem valida o laudo?");
console.log({
  boxesLeft: w.semanticNodes.filter((n) => n.semanticType === "Hotspot").length,
  promoted: h && { id: h.id, resolution: h.resolution, status: h.status },
  edgeRekeyed: w.graph.edges.find((e) => e.id === "rbox")?.to,
  layoutRekeyed: w.graph.layouts.all?.["hotspot:" + h?.id],
  typeInList: w.elementTypes.includes("Hotspot"),
  errors,
});
// modal: tipo "Hotspot" digitado em caixa livre vira hotspot
await page.keyboard.press("Escape"); await page.keyboard.press("n");
await page.click('[data-modal-type="semantic"]'); await page.fill("#newName", "Risco X"); await page.fill("#newCustomSemantic", "Hotspot"); await page.click("#saveNew");
const w2 = await page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
console.log({ modalCoerced: !!w2.decisions.find((d) => d.title === "Risco X"), semanticCreated: !!w2.semanticNodes.find((n) => n.name === "Risco X") });
await page.keyboard.press("n"); await page.click('[data-modal-type="hotspot"]');
console.log({ hotspotModalHasSemanticSelect: await page.locator('[data-field="new.semanticType"]').count() });
await browser.close();
