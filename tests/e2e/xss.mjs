import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { appUrl } from "./target.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PAYLOAD = '1px"><img src=x onerror="window.__xss=(window.__xss||0)+1">';

const poisoned = JSON.parse(fs.readFileSync(path.join(here, "fixtures/with-hotspot-box.json"), "utf8"));
const sceneNodes = Object.keys(poisoned.graph.layouts["scene:preconsulta"]);
for (const mode of ["", "timeline|", "lanes|"])
  for (const scope of ["scene:preconsulta", "all"])
    poisoned.graph.layouts[mode + scope] = Object.fromEntries(sceneNodes.map((nodeKey) => [nodeKey, { x: PAYLOAD, y: 100 }]));
poisoned.view = { layoutMode: "layers", journey: poisoned.journeys[0]?.id ?? "", chapter: "consulta", scene: "preconsulta" };

const STORE = "pep-atlas-studio-v4";
const poisonedJson = JSON.stringify(poisoned);
const TITLE_PAYLOAD = '<img src=x onerror="window.__xss=(window.__xss||0)+1">Mapa da oficina';
const titled = { ...JSON.parse(fs.readFileSync(path.join(here, "fixtures/with-hotspot-box.json"), "utf8")), title: TITLE_PAYLOAD };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 } })).newPage();
const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const dialogs = [];
page.on("dialog", (d) => { dialogs.push({ type: d.type(), message: d.message() }); d.accept(); });
const xssCount = () => page.evaluate(() => window.__xss);
const importFile = (name, content) => page.setInputFiles("#importFile", { name, mimeType: "application/json", buffer: Buffer.from(content) });
const leaksContent = (message) => message.includes("onerror") || message.includes("<img");
const headerTitle = () => page.locator("#workspaceTitle").textContent({ timeout: 2000 });
try {
  await page.goto(appUrl()); await page.waitForSelector(".node");
  const countsBefore = await page.textContent("#counts");
  r.seedTitle = await headerTitle();
  if (r.seedTitle !== "Da jornada à arquitetura") fail(`o cabeçalho deveria mostrar o título do mapa: ${r.seedTitle}`);

  await importFile("poc.json", poisonedJson);
  await page.waitForTimeout(600);
  r.xssAfterImport = await xssCount();
  if (r.xssAfterImport !== undefined) fail(`payload executou no import (${r.xssAfterImport}x)`);
  const importAlert = dialogs.find((d) => d.type === "alert")?.message ?? "";
  r.importAlert = importAlert;
  if (!/graph\.layouts\.[^ ]+\.x \(não é número\)/.test(importAlert) || !/ e mais \d+$/.test(importAlert)) fail(`import inválido deveria listar as 3 primeiras issues: ${importAlert}`);
  if (leaksContent(importAlert)) fail("o alerta do import inválido não pode trazer trecho do conteúdo");
  if (dialogs.some((d) => d.type === "confirm")) fail("import inválido não deveria pedir confirmação para substituir o mapa");
  if ((await page.textContent("#counts")) !== countsBefore) fail("import inválido não deveria substituir o mapa");

  dialogs.length = 0;
  await importFile("quebrado.json", '{"schema": <img src=x onerror=alert(1)>');
  await page.waitForTimeout(300);
  const brokenAlert = dialogs.find((d) => d.type === "alert")?.message ?? "";
  r.brokenAlert = brokenAlert;
  if (!brokenAlert.startsWith("Falha na importação") || leaksContent(brokenAlert)) fail(`JSON quebrado deveria falhar sem trecho do conteúdo: ${brokenAlert}`);

  dialogs.length = 0;
  await importFile("titulo.json", JSON.stringify(titled));
  await page.waitForTimeout(400);
  r.importedTitle = await headerTitle();
  if (r.importedTitle !== TITLE_PAYLOAD) fail(`o cabeçalho deveria mostrar o título importado como texto: ${r.importedTitle}`);
  r.xssAfterTitle = await xssCount();
  if (r.xssAfterTitle !== undefined) fail(`o título do mapa executou HTML (${r.xssAfterTitle}x)`);

  dialogs.length = 0;
  // O beforeunload do app regrava o mapa atual: o dado envenenado entra já no documento novo, uma única vez.
  await page.addInitScript(([key, raw]) => {
    if (sessionStorage.getItem("xss-seeded")) return;
    sessionStorage.setItem("xss-seeded", "1");
    localStorage.setItem(key, raw);
  }, [STORE, poisonedJson]);
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), page.reload()]);
  await page.waitForSelector(".node");
  r.xssAfterPoisonedLoad = await xssCount();
  if (r.xssAfterPoisonedLoad !== undefined) fail(`payload executou na carga do localStorage (${r.xssAfterPoisonedLoad}x)`);
  const notice = dialogs.find((d) => d.type === "confirm")?.message ?? "";
  r.notice = notice;
  if (!notice.includes("Mapa salvo com dados inválidos")) fail(`carga inválida deveria avisar o usuário: ${notice}`);
  const exported = fs.readFileSync(await download.path(), "utf8");
  if (exported !== poisonedJson) fail("a exportação deveria trazer o JSON salvo, sem alteração");
  r.backupKept = await page.evaluate((key) => localStorage.getItem(key + ":invalid"), STORE) === poisonedJson;
  if (!r.backupKept) fail("o JSON inválido deveria ficar guardado no navegador");

  dialogs.length = 0;
  await page.reload(); await page.waitForSelector(".node");
  r.noticeAgain = dialogs.length;
  if (r.noticeAgain) fail("o aviso deveria aparecer só na carga que encontrou o dado inválido");

  const docsPoisoned = {
    ...JSON.parse(fs.readFileSync(path.join(here, "fixtures/with-hotspot-box.json"), "utf8")),
    docs: [{ id: "d1", title: "Ata", body: "texto", link: "", createdAt: 0, updatedAt: 0 }],
    view: { area: "docs", docId: "d1", docsMode: 'split"><img src=x onerror="window.__xss=(window.__xss||0)+1">' },
  };
  await page.addInitScript(([key, raw]) => {
    if (sessionStorage.getItem("docs-seeded")) return;
    sessionStorage.setItem("docs-seeded", "1");
    localStorage.setItem(key, raw);
  }, [STORE, JSON.stringify(docsPoisoned)]);
  await page.reload(); await page.waitForSelector(".doc-head");
  await page.waitForTimeout(300);
  r.xssAfterDocsMode = await xssCount();
  if (r.xssAfterDocsMode !== undefined) fail(`o modo do caderno salvo executou HTML (${r.xssAfterDocsMode}x)`);
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(r, "\nerrors:", errors);
await browser.close();
