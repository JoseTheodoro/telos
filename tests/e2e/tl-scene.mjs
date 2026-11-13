import { chromium } from "playwright-core";
const [ROOT] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 } })).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`file://${ROOT}/dist/index.html`); await page.waitForSelector(".node");
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
await page.click('[data-focus-chapter="consulta"]'); await page.keyboard.press("Escape");
let w = await ws(); const C = () => (w.graph.layouts["lanes|chapter:consulta"] ?? w.graph.layouts["timeline|chapter:consulta"]);
const idx = w.scenes.findIndex((s) => s.id === "preconsulta"); const nextScene = w.scenes[idx + 1];
const lastEvX = Math.max(...w.events.filter((e) => e.sceneId === "preconsulta").map((e) => C()["event:" + e.id].x));
const nextBefore = C()["scene:" + nextScene.id].x;
const b = await page.locator('[data-node="scene:preconsulta"]').boundingBox();
await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
const sel = await page.$eval(".node.selected", (n) => n.dataset.node);
await page.keyboard.press("Enter"); await page.keyboard.type("Enfermagem confere pulseira"); await page.keyboard.press("Enter");
w = await ws();
const ns = w.scenes.find((s) => s.title === "Enfermagem confere pulseira");
console.log({ sel, scope: await page.inputValue("#chapterFilter"), newSceneX: C()["scene:" + ns.id].x, expected: lastEvX + 290, rowY: C()["scene:" + ns.id].y, nextScenePushed: C()["scene:" + nextScene.id].x - nextBefore, orderOk: w.scenes[idx + 1].id === ns.id, errors });
// chapter selecionado → Tab cria cena no fim do capítulo
await page.click('[data-focus-chapter="consulta"]'); // seleciona capítulo
const lastX = Math.max(...Object.entries(C()).filter(([k]) => k.startsWith("scene:") || k.startsWith("event:")).map(([, p]) => p.x));
await page.keyboard.press("Tab"); await page.keyboard.type("Fim da consulta"); await page.keyboard.press("Enter");
w = await ws(); const fs2 = w.scenes.find((s) => s.title === "Fim da consulta");
console.log({ childScene: C()["scene:" + fs2.id], expectedX: lastX + 290 });
await browser.close();
