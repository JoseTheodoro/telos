// Mapa salvo com estrutura quebrada não pode travar a partida: o app abre um mapa vazio e oferece exportar o salvo.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { appUrl } from "./target.mjs";

const STORE = "pep-atlas-studio-v4";
const here = path.dirname(fileURLToPath(import.meta.url));
const broken = { ...JSON.parse(fs.readFileSync(path.join(here, "fixtures/with-hotspot-box.json"), "utf8")), chapters: {} };
const brokenJson = JSON.stringify(broken);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 }, acceptDownloads: true })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const dialogs = [];
page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
try {
  await page.addInitScript(([key, raw]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem(key, raw);
  }, [STORE, brokenJson]);
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.goto(appUrl())]);
  await page.waitForSelector("#emptyStage:not([hidden])", { timeout: 5000 });
  r.cards = await page.locator("#nodes .node").count();
  r.notice = dialogs.find((m) => m.includes("Mapa salvo com dados inválidos")) ?? "";
  if (r.cards) fail(`o app deveria abrir um mapa vazio: ${r.cards} cards`);
  if (!r.notice) fail(`a carga deveria avisar o mapa inválido: ${JSON.stringify(dialogs)}`);
  r.exportedIntact = fs.readFileSync(await download.path(), "utf8") === brokenJson;
  if (!r.exportedIntact) fail("a exportação deveria trazer o JSON salvo, sem alteração");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 3000 }), page.click("#importBtn")]);
  r.importBound = Boolean(chooser);
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(r, "\nerrors:", errors);
await browser.close();
