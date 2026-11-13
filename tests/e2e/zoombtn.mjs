import { chromium } from "playwright-core";
const [ROOT] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const [name, url] of [["legacy", `file://${ROOT}/legacy/PEP_Atlas_Studio_v1.5.html`], ["build", `file://${ROOT}/dist/index.html`]]) {
  const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 } })).newPage();
  await page.goto(url); await page.waitForSelector(".node");
  const z0 = await page.textContent("#zoomLabel");
  await page.click("#zoomIn"); await page.click("#zoomIn");
  const z1 = await page.textContent("#zoomLabel");
  await page.click("#zoomFit"); const z2 = await page.textContent("#zoomLabel");
  console.log(name, { before: z0, afterZoomIn2x: z1, afterFitBtn: z2 });
}
await browser.close();
