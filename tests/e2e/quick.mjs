import { chromium } from "playwright-core";
import { appUrl } from "./target.mjs";
const [, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 } })).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", (d) => d.accept());
await page.goto(appUrl()); await page.waitForSelector(".node");
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const r = {};
const evOf = (w, scene) => w.events.filter((e) => e.sceneId === scene).map((e) => e.name);
const editorVal = () => page.$eval(".name-editor", (t) => ({ v: t.value, sel: t.value.slice(t.selectionStart, t.selectionEnd) })).catch(() => null);

// 1) cena selecionada → Tab cria evento filho com editor aberto
await page.click('[data-focus-scene="preconsulta"]');
let w0 = await ws();
await page.keyboard.press("Tab");
r.editorAfterTab = await editorVal();
await page.keyboard.type("Triagem iniciada");
await page.keyboard.press("Tab");                       // salva + próximo evento conectado
await page.keyboard.type("Sinais vitais aferidos");
await page.keyboard.press("Enter");
let w1 = await ws();
r.eventsInScene = evOf(w1, "preconsulta");
const id = (w, name) => w.events.find((e) => e.name === name)?.id;
r.seqEdge = w1.graph.edges.some((e) => e.from === "event:" + id(w1, "Triagem iniciada") && e.to === "event:" + id(w1, "Sinais vitais aferidos"));
r.edgesAdded = w1.graph.edges.length - w0.graph.edges.length;
const lay = (w1.graph.layouts["lanes|scene:preconsulta"] ?? w1.graph.layouts["timeline|scene:preconsulta"] ?? w1.graph.layouts["scene:preconsulta"]);
const pA = lay["event:" + id(w1, "Triagem iniciada")], pB = lay["event:" + id(w1, "Sinais vitais aferidos")];
r.secondIsRight = pB.x > pA.x;
r.selectedAfter = await page.$eval(".node.selected .name", (n) => n.textContent);
await page.screenshot({ path: `${SHOTS}/quick-1.png` });

// 2) Enter = irmão; Esc descarta e volta seleção à origem
await page.keyboard.press("Enter");
r.siblingEditor = await editorVal();
await page.keyboard.press("Escape");
let w2 = await ws();
r.afterEscCount = evOf(w2, "preconsulta").length;
r.selectedAfterEsc = await page.$eval(".node.selected .name", (n) => n.textContent);

// 3) Enter → nomear → Ctrl+Z remove em um passo
await page.keyboard.press("Enter");
await page.keyboard.type("Alergias registradas");
await page.keyboard.press("Enter");
r.siblingCreated = evOf(await ws(), "preconsulta").includes("Alergias registradas");
const sib = (await ws()).events.find((e) => e.name === "Alergias registradas");
const lay3 = ((await ws()).graph.layouts["lanes|scene:preconsulta"] ?? (await ws()).graph.layouts["timeline|scene:preconsulta"] ?? (await ws()).graph.layouts["scene:preconsulta"]);
r.siblingBelow = lay3["event:" + sib.id].y > lay3["event:" + id(w1, "Sinais vitais aferidos")].y;
await page.keyboard.press("Meta+z");
r.undoOneStep = !evOf(await ws(), "preconsulta").includes("Alergias registradas");

// 4) Enter numa cena (recorte de cena) → nova cena no mesmo capítulo, recorte se abre ao capítulo
await page.click('[data-focus-scene="preconsulta"]');
await page.keyboard.press("Enter");
await page.keyboard.type("Enfermagem confere pulseira");
await page.keyboard.press("Enter");
let w4 = await ws();
const newScene = w4.scenes.find((s) => s.title === "Enfermagem confere pulseira");
r.newSceneChapter = newScene?.chapter;
r.sceneOrderAfterOrigin = w4.scenes.findIndex((s) => s.id === newScene.id) === w4.scenes.findIndex((s) => s.id === "preconsulta") + 1;
const chapterLayout = w4.graph.layouts["lanes|chapter:consulta"] ?? w4.graph.layouts["timeline|chapter:consulta"] ?? {};
r.newScenePosition = { x: chapterLayout["scene:" + newScene?.id]?.x, originX: chapterLayout["scene:preconsulta"]?.x };
r.chapterFilter = await page.inputValue("#chapterFilter");
r.sceneFilter = await page.inputValue("#sceneFilter");

// 5) Caixa livre Comando → Tab cria próxima caixa (mesmo tipo) conectada
await page.click("#quickActionBtn");
await page.fill("#newName", "Registrar triagem");
await page.click("#saveNew");
await page.keyboard.press("Tab");
await page.keyboard.type("Confirmar alergias");
await page.keyboard.press("Enter");
let w5 = await ws();
const c1 = w5.semanticNodes.find((n) => n.name === "Registrar triagem"), c2 = w5.semanticNodes.find((n) => n.name === "Confirmar alergias");
r.semanticChain = { type2: c2?.semanticType, linked: w5.graph.edges.some((e) => e.from === "semantic:" + c1.id && e.to === "semantic:" + c2?.id), es: await page.$eval(".node.selected", (n) => n.dataset.es) };
await page.screenshot({ path: `${SHOTS}/quick-2.png` });

// 6) Botão do inspetor
await page.click('[data-quick="sibling"]');
r.buttonOpensEditor = !!(await editorVal());
await page.keyboard.press("Escape");

// 7) Tab sem seleção não cria nada
await page.keyboard.press("Escape");
const before = (await ws()).semanticNodes.length;
await page.keyboard.press("Tab");
r.tabWithoutSelection = (await ws()).semanticNodes.length === before && !(await editorVal());

const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
if (r.editorAfterTab?.sel !== "Novo evento") fail("Tab na cena deveria abrir o editor do evento filho com o nome selecionado");
if (!r.eventsInScene.includes("Triagem iniciada") || !r.eventsInScene.includes("Sinais vitais aferidos")) fail(`eventos criados por Tab: ${r.eventsInScene}`);
if (!r.seqEdge) fail("Tab num evento deveria ligar o próximo evento com seta");
if (!r.secondIsRight) fail("evento seguinte deveria ficar à direita");
if (r.selectedAfter !== "Sinais vitais aferidos") fail(`seleção depois de Enter: ${r.selectedAfter}`);
if (!r.siblingEditor || r.afterEscCount !== 4 || r.selectedAfterEsc !== "Sinais vitais aferidos") fail("Esc deveria descartar o irmão e devolver a seleção à origem");
if (!r.siblingCreated || !r.siblingBelow) fail("Enter num evento deveria criar o irmão abaixo");
if (!r.undoOneStep) fail("Ctrl+Z deveria remover o irmão em um passo");
if (r.newSceneChapter !== "consulta" || !r.sceneOrderAfterOrigin) fail("Enter na cena deveria criar a cena seguinte no mesmo capítulo");
if (typeof r.newScenePosition.x !== "number" || !(r.newScenePosition.x > r.newScenePosition.originX)) fail(`cena nova deveria ficar à direita da origem: ${JSON.stringify(r.newScenePosition)}`);
if (r.chapterFilter !== "consulta" || r.sceneFilter !== "") fail(`recorte deveria abrir para o capítulo: ${r.chapterFilter}/${r.sceneFilter}`);
if (r.semanticChain.type2 !== "Estado" || !r.semanticChain.linked || r.semanticChain.es !== "agregado") fail(`Tab numa Ação deveria criar o Estado seguinte ligado: ${JSON.stringify(r.semanticChain)}`);
if (!r.buttonOpensEditor) fail("botão de irmão no inspetor não abriu o editor");
if (!r.tabWithoutSelection) fail("Tab sem seleção não pode criar nada");
console.log(r, "\nerrors:", errors);
await browser.close();
