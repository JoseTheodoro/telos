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

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 } })).newPage();
const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
const alerts = [];
page.on("dialog", (d) => { if (d.type() === "alert") alerts.push(d.message()); d.accept(); });
const xssCount = () => page.evaluate(() => window.__xss);
try {
  await page.goto(appUrl()); await page.waitForSelector(".node");
  await page.setInputFiles("#importFile", { name: "poc.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(poisoned)) });
  await page.waitForTimeout(600);
  r.xssAfterImport = await xssCount();
  if (r.xssAfterImport !== undefined) fail(`payload executou no import (${r.xssAfterImport}x)`);
  await page.reload(); await page.waitForTimeout(600);
  r.xssAfterReload = await xssCount();
  if (r.xssAfterReload !== undefined) fail(`payload executou depois do reload (${r.xssAfterReload}x)`);
  r.alerts = alerts.length;
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(r);
await browser.close();
