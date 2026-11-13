import { chromium } from "playwright-core";
const [ROOT] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 } })).newPage();
await page.goto(`file://${ROOT}/dist/index.html`); await page.waitForSelector(".node");
await page.click('[data-focus-scene="preconsulta"]');
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
console.log({ activeAfterCanvasClick: active, enterCreatesAfterButton: editor === 1, enterOnFocusedButtonDoesNotCreate: editor2 === 0 });
await browser.close();
