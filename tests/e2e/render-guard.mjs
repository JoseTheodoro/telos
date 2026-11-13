// A segunda barreira contra XSS: mesmo que um texto chegue às posições em memória, o render recusa interpolá-lo.
// Roda no servidor de dev do Vite para alcançar o estado do app pelos módulos; ignora E2E_BASE_URL.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PAYLOAD = '1px"><img src=x onerror="window.__xss=(window.__xss||0)+1">';

const vite = spawn(path.join(root, "node_modules/.bin/vite"), ["--port", "0", "--strictPort", "false", "--clearScreen", "false"], { cwd: root });
const url = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("servidor de dev não subiu em 15 s")), 15000);
  vite.stdout.on("data", (chunk) => {
    const found = String(chunk).replace(/\x1b\[[0-9;]*m/g, "").match(/http:\/\/localhost:\d+\//);
    if (found) { clearTimeout(timer); resolve(found[0]); }
  });
});

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("dialog", (d) => d.accept());
const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
try {
  await page.goto(url); await page.waitForSelector(".node");
  r.renderRefusal = await page.evaluate(async (payload) => {
    const { state } = await import("/src/core/state.ts");
    const { refreshAll } = await import("/src/app.ts");
    for (const positions of Object.values(state.ws.graph.layouts))
      for (const point of Object.values(positions)) point.x = payload;
    for (const note of state.ws.canvasNotes) note.w = payload;
    try { refreshAll(); return ""; } catch (err) { return err.message; }
  }, PAYLOAD);
  await page.waitForTimeout(300);
  r.xss = await page.evaluate(() => window.__xss);
  if (r.xss !== undefined) fail(`o render interpolou texto como HTML (${r.xss}x)`);
  if (r.renderRefusal !== "valor não numérico no render") fail(`o render deveria recusar a posição não numérica: ${r.renderRefusal}`);
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(r, "\nerrors:", errors);
await browser.close();
vite.kill();
