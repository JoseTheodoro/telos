// A Inter vem do próprio app: com a rede externa bloqueada, os pesos 400, 500 e 600 carregam em telos.html.
import { chromium } from "playwright-core";
import { appUrl, openTelos } from "../target.mjs";

const WEIGHTS = ["400", "500", "600"];
const appOrigin = new URL(appUrl()).origin;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const r = { blockedHosts: [] };
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };

await page.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.origin === appOrigin || ["data:", "blob:"].includes(url.protocol)) return route.continue();
  r.blockedHosts.push(url.host);
  return route.abort();
});

try {
  await openTelos(page);
  await page.waitForSelector(".home");
  r.faces = await page.evaluate(async () => {
    const faces = [...document.fonts].filter((face) => face.family.replace(/["']/g, "") === "Inter");
    await Promise.allSettled(faces.map((face) => face.load()));
    return faces.map((face) => ({ weight: face.weight, status: face.status }));
  });
  if (r.blockedHosts.length) fail(`o app pediu recursos de fora: ${[...new Set(r.blockedHosts)].join(", ")}`);
  const loaded = new Set(r.faces.filter((face) => face.status === "loaded").map((face) => face.weight));
  const missing = WEIGHTS.filter((weight) => !loaded.has(weight));
  if (missing.length) fail(`Inter deveria carregar nos pesos ${missing.join(", ")}: ${JSON.stringify(r.faces)}`);
} catch (err) {
  r.FAILED = err.message.split("\n")[0];
}
console.log(r, "\nerrors:", errors);
await browser.close();
