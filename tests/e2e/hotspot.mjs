import { chromium } from "playwright-core";
import { appUrl } from "./target.mjs";
const [ROOT, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 } })).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", (d) => d.accept());
await page.goto(appUrl()); await page.waitForSelector(".node");
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const r = {};
try {
let w = await ws();
r.migrated = { flag: w.graph.hotspotsLinked, linked: w.decisions.filter((d) => w.graph.edges.some((e) => e.to === "hotspot:" + d.id)).length, total: w.decisions.length };
const e01 = w.graph.edges.find((e) => e.to === "hotspot:E-01"); r.e01 = e01 && `${e01.from} -[${e01.label}]-> ${e01.to}`;

// aba hotspots → ver no canvas
await page.click('[data-tab="decisions"]');
r.tabHeader = (await page.textContent("#sidebarBody p.sub")).slice(0, 60);
await page.click('[data-select-node="hotspot:E-01"]');
r.focusScene = await page.inputValue("#sceneFilter");
r.selected = await page.$eval(".node.selected", (n) => `${n.dataset.node} es=${n.dataset.es}`);
r.inspector = `${await page.textContent("#inspectTitle")} | ${await page.textContent("#inspectSubtitle")}`;
r.hotspotEdgeColor = await page.$eval('#edgePaths g[data-edge] .edge-line', () => [...document.querySelectorAll("#edgePaths g")].map(g => g.querySelector(".edge-line").style.stroke).find(c => c.includes("179, 38, 30")) || "none");
// status Resolvida
await page.selectOption('[data-field="status"]', "Resolvida");
r.resolvedCard = await page.$eval('.node[data-node="hotspot:E-01"]', (n) => [n.dataset.status, getComputedStyle(n).opacity]);
r.tabAfterResolve = (await page.textContent("#sidebarBody p.sub")).match(/\d+ em aberto/)?.[0];
await page.screenshot({ path: `${SHOTS}/hotspot-1.png` });

// H num evento → hotspot conectado, editor aberto
await page.click('[data-tab="inventory"]'); await page.fill("#search", "PréConsultaIniciada");
await page.click('.inventory-item[data-select-node^="event:"]');
const b = await page.locator(".node.selected").boundingBox();
const evKey = await page.$eval(".node.selected", (n) => n.dataset.node);
await page.keyboard.press("h");
r.editorOpen = await page.$eval(".name-editor", (t) => t.value).catch(() => null);
await page.keyboard.type("Quem confirma a identidade do paciente?");
await page.keyboard.press("Enter");
w = await ws();
const h = w.decisions.at(-1);
r.newHotspot = { id: h.id, title: h.title, status: h.status, edge: w.graph.edges.some((e) => e.from === evKey && e.to === "hotspot:" + h.id && e.label === "levanta dúvida") };
await page.screenshot({ path: `${SHOTS}/hotspot-2.png` });
// Esc descarta
await page.mouse.click(b.x + b.width / 2, b.y + 12); await page.keyboard.press("h"); await page.keyboard.press("Escape");
r.escDiscards = (await ws()).decisions.length === w.decisions.length;
// conectar hotspot → outro card (modo conectar) = "questiona"
await page.click('[data-tab="decisions"]'); await page.click(`[data-select-node="hotspot:${h.id}"]`);
r.selectedViaTab = await page.$eval(".node.selected", (n) => n.dataset.node);
r.filtersAfterTab = [await page.inputValue("#journeyFilter"), await page.inputValue("#chapterFilter"), await page.inputValue("#sceneFilter")];
r.evKey = evKey;
await page.keyboard.press("c");
const hb = await page.locator(".node.selected").boundingBox(); await page.mouse.click(hb.x + hb.width / 2, hb.y + 12);   // origem
const sc = await page.locator('.node[data-kind="scene"]').first().boundingBox(); await page.mouse.click(sc.x + sc.width / 2, sc.y + 12); // destino
r.kindLine = await page.$eval('.node[data-kind="hotspot"] .kind', (k) => k.textContent);
w = await ws();
r.connectFromHotspot = w.graph.edges.find((e) => e.from === "hotspot:" + h.id)?.label;
await page.keyboard.press("v");
// botão toolbar sem seleção → hotspot solto, mapa completo
await page.keyboard.press("Escape");
await page.click("#quickHotspotBtn"); await page.keyboard.type("Risco: duplicidade de cadastro"); await page.keyboard.press("Enter");
w = await ws();
r.loose = { id: w.decisions.at(-1).id, edges: w.graph.edges.filter((e) => e.from === "hotspot:" + w.decisions.at(-1).id || e.to === "hotspot:" + w.decisions.at(-1).id).length, journeyFilter: await page.inputValue("#journeyFilter") };
// legenda conta hotspots no recorte
r.legendHotspot = await page.$$eval("#esLegend li", (ls) => ls.find((l) => l.textContent.startsWith("Hotspot"))?.textContent);
// catálogo
await page.click('[data-tab="inventory"]'); await page.fill("#search", "");
r.inventoryGroup = await page.$$eval(".inventory-title span", (s) => s.map((x) => x.textContent).find((t) => t.startsWith("HOTSPOT")));
// limpar canvas apaga tudo o que está no canvas, hotspots inclusive (asserções em wipe.mjs)
await page.click("#clearCanvasBtn");
r.wipePreview = (await page.textContent(".wipe-preview")).replace(/\s+/g, " ");
await page.fill("#confirmWipeInput", "APAGAR"); await page.click("#executeWipe");
w = await ws();
r.afterWipe = { decisions: w.decisions.length, edges: w.graph.edges.length, emptyVisible: await page.locator("#emptyStage").isVisible(), hotspotCards: await page.locator('.node[data-kind="hotspot"]').count() };
await page.screenshot({ path: `${SHOTS}/hotspot-3.png` });
// importar o JSON v1.5 da oficina → migração
await page.setInputFiles("#importFile", `${ROOT}/atlas-exemplo.json`);
await page.waitForTimeout(400);
w = await ws();
r.importMigrated = { flag: w.graph.hotspotsLinked, linked: w.decisions.filter((d) => w.graph.edges.some((e) => e.to === "hotspot:" + d.id)).length, total: w.decisions.length };
// recarregar: migração não duplica
await page.reload(); await page.waitForSelector(".node");
const w2 = await ws();
r.noDuplicateOnReload = w2.graph.edges.length === w.graph.edges.length;
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(r, "\nerrors:", errors);
await browser.close();
