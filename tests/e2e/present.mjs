import { chromium } from "playwright-core";
const [ROOT, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 } })).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`file://${ROOT}/dist/index.html`); await page.waitForSelector(".node");
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const title = () => page.textContent(".pres-scene h1");
const count = () => page.textContent(".pres-count");
const r = {};
try {
  // começa na cena selecionada
  await page.click('[data-focus-scene="preconsulta"]');
  await page.click("#presentBtn");
  r.open = await page.isVisible("#presentation");
  r.start = { title: await title(), count: await count() };
  r.events = await page.$$eval(".pres-events li b", (x) => x.map((b) => b.textContent));
  r.tech = await page.$$eval(".pres-tech i", (x) => x.map((b) => b.textContent));
  r.hotspots = await page.$$eval(".pres-hotspots li .pres-hid", (x) => x.map((b) => b.textContent));
  // atalhos do canvas não disparam
  const before = (await ws()).decisions.length;
  await page.keyboard.press("h"); await page.keyboard.press("n"); await page.keyboard.press("Delete");
  r.shortcutsBlocked = (await ws()).decisions.length === before && !(await page.evaluate(() => document.querySelector("#modal").open));
  // navegação
  await page.keyboard.press("ArrowRight"); r.next = await count();
  await page.keyboard.press(" "); r.space = await count();
  await page.keyboard.press("ArrowLeft"); r.prev = await count();
  await page.keyboard.press("End"); r.end = { count: await count(), nextDisabled: await page.isDisabled('[data-pres-go="1"]') };
  await page.keyboard.press("Home"); r.home = { count: await count(), title: await title(), prevDisabled: await page.isDisabled('[data-pres-go="-1"]') };
  await page.click('[data-pres-go="1"]'); r.clickNext = await count();
  // pular pela mini curva
  await page.click('[data-pres-jump="10"]'); r.jump = await count();
  r.dots = await page.$$eval(".pres-dot", (d) => d.length);
  // nota de emoção na apresentação (undo funciona)
  const sid = (await ws()).scenes.find((s) => s.title === (/* current */ "")) ;
  await page.click('[data-pres-emotion="-2"]');
  const curTitle = await title();
  let w = await ws(); r.rated = w.scenes.find((s) => s.title === curTitle).emotion;
  r.bigFace = await page.textContent(".pres-emotion-now b");
  r.stripCurrentSign = await page.getAttribute(".pres-dot.current", "data-sign");
  await page.keyboard.press("Meta+z");
  w = await ws(); r.undoInPres = w.scenes.find((s) => s.title === curTitle).emotion ?? null;
  r.stillOpenAfterUndo = await page.isVisible("#presentation");
  // dor aparece
  await page.click('[data-pres-emotion="1"]');
  await page.keyboard.press("Escape");
  r.closed = await page.isHidden("#presentation");
  r.selectedAfterExit = await page.textContent("#inspectTitle");
  r.exitMatches = r.selectedAfterExit === curTitle;
  // tecla P abre; "Ver no canvas" muda o recorte para a cena
  await page.keyboard.press("p");
  r.pOpens = await page.isVisible("#presentation");
  r.pStartsAtSelected = (await title()) === curTitle;
  await page.screenshot({ path: `${SHOTS}/present-1.png` });
  await page.click("[data-pres-canvas]");
  r.canvasFocus = await page.inputValue("#sceneFilter").catch(() => "n/a");
  r.selectedScene = await page.textContent("#inspectTitle");
  // jornada inteira: começa no início quando nada selecionado
  await page.keyboard.press("Escape");
  await page.click("#presentBtn");
  r.noSelection = await count();
  await page.keyboard.press("Escape");
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(JSON.stringify(r, null, 1), "\nerrors:", errors);
await browser.close();
