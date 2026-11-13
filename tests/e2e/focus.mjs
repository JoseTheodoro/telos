import { chromium } from "playwright-core";
const [ROOT] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 } })).newPage();
await page.goto(`file://${ROOT}/dist/index.html`); await page.waitForSelector(".node");
await page.click('[data-focus-scene="preconsulta"]');
const scope = await page.inputValue("#sceneFilter");
await page.click("#fitBtn");                                    // botão fica focado
const b = await page.locator('.node[data-kind="scene"]').boundingBox();
await page.mouse.click(b.x + b.width / 2, b.y + 15);             // clica no card
const active = await page.evaluate(() => document.activeElement.tagName);
await page.keyboard.press("Enter");
const editor = await page.locator(".name-editor").count();
await page.keyboard.press("Escape");
// botão focado por teclado: Enter ativa o botão, não cria
await page.focus("#layoutBtn"); await page.keyboard.press("Enter");
const editor2 = await page.locator(".name-editor").count();
const r = { scope, activeAfterCanvasClick: active, enterCreatesAfterButton: editor === 1, enterOnFocusedButtonDoesNotCreate: editor2 === 0 };
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
if (r.scope !== "preconsulta") fail(`recorte ativo deveria ser a cena preconsulta: ${r.scope}`);
if (r.activeAfterCanvasClick === "BUTTON") fail("clicar no card não tirou o foco do botão");
if (!r.enterCreatesAfterButton) fail("Enter depois de clicar no card não abriu o editor");
if (!r.enterOnFocusedButtonDoesNotCreate) fail("Enter num botão focado abriu o editor");
console.log(r);
await browser.close();
