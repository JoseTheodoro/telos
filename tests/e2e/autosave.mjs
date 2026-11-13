// Passo 0: gravação adiada do caderno (300 ms), gravação pendente salva ao recarregar e aviso de tamanho perto do limite.
import { chromium } from "playwright-core";
import { appUrl } from "./target.mjs";
const [, SHOTS] = process.argv.slice(2);
const STORE = "pep-atlas-studio-v4";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1540, height: 920 } });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("dialog", (d) => d.accept());
const URL = appUrl();
await page.goto(URL); await page.waitForSelector(".node");
const savedBody = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)).docs[0]?.body ?? null, STORE);
const r = {};
try {
  await page.click('[data-area="docs"]');
  await page.click(".docs-empty [data-doc-new]");
  await page.keyboard.type("Rascunho");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(450);

  // Várias teclas seguidas: nada gravado logo após digitar, tudo gravado depois da pausa.
  await page.keyboard.type("linha-um");
  const rightAfter = await savedBody();
  await page.waitForTimeout(450);
  const afterPause = await savedBody();
  r.debounce = { notYet: !String(rightAfter).includes("linha-um"), saved: String(afterPause).includes("linha-um") };
  if (!r.debounce.notYet || !r.debounce.saved) r.FAILED = "gravação adiada não se comportou como esperado";

  // Recarregar logo depois de digitar: o beforeunload grava o pendente.
  await page.keyboard.type(" fim");
  await page.reload(); await page.waitForSelector("#docsView:not([hidden])");
  const afterReload = await savedBody();
  r.flushOnUnload = String(afterReload).endsWith("linha-um fim");
  if (!r.flushOnUnload) r.FAILED = `texto pendente perdido no reload: ${JSON.stringify(afterReload)}`;

  // Sem aviso com o mapa pequeno.
  r.smallNoWarn = !(await page.$eval("#savestate", (el) => el.classList.contains("warn")));

  // Mapa grande (> 4 MB): indicador em alerta e toast, sem quebrar o salvamento.
  const padded = await page.evaluate((k) => {
    const ws = JSON.parse(localStorage.getItem(k));
    ws.canvasNotes.push({ id: "e2e-pad", text: "x".repeat(4.3 * 1024 * 1024), format: "text", w: 320, h: 180, scope: "scene:__fora-do-recorte__" });
    try { localStorage.setItem(k, JSON.stringify(ws)); return true; } catch (e) { return String(e); }
  }, STORE);
  r.paddedStored = padded;
  // Fechar sem beforeunload: um reload gravaria o workspace em memória por cima do JSON injetado.
  await page.close();
  const big = await ctx.newPage();
  big.on("pageerror", (e) => errors.push(e.message)); big.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await big.goto(URL); await big.waitForSelector("#savestate.warn", { timeout: 15000 });
  r.bigWarn = {
    indicator: await big.textContent("#savestate"),
    toast: await big.textContent("#toast"),
  };
  if (!/MB/.test(r.bigWarn.indicator) || !/limite/.test(r.bigWarn.toast)) r.FAILED = "aviso de tamanho ausente";
  await big.screenshot({ path: `${SHOTS}/autosave-1.png`, clip: { x: 0, y: 0, width: 1540, height: 70 } });
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(JSON.stringify(r, null, 1), "\nerrors:", errors);
await browser.close();
