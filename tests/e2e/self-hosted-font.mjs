// A fonte vem do próprio app: com a rede externa bloqueada, JetBrains Mono carrega e nada sai para o Google Fonts.
import { chromium } from "playwright-core";
import { appUrl, openApp } from "./target.mjs";

const GOOGLE_FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
const LOCAL_PROTOCOLS = ["file:", "data:", "blob:"];
const appOrigin = new URL(appUrl()).origin;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1540, height: 920 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const r = { blockedHosts: [] };
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };

await page.route("**/*", (route) => {
  const url = new URL(route.request().url());
  const isLocal = LOCAL_PROTOCOLS.includes(url.protocol) || url.origin === appOrigin;
  if (isLocal) return route.continue();
  r.blockedHosts.push(url.host);
  return route.abort();
});

try {
  await openApp(page);
  await page.waitForSelector("#nodes .node", { timeout: 5000 });
  r.faces = await page.evaluate(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts].filter((face) => face.family.replace(/["']/g, "") === "JetBrains Mono");
    await Promise.allSettled(faces.map((face) => face.load()));
    return faces.map((face) => ({ weight: face.weight, status: face.status }));
  });
  const requestedGoogle = r.blockedHosts.filter((host) => GOOGLE_FONT_HOSTS.includes(host));
  if (requestedGoogle.length) fail(`o app pediu fonte ao Google: ${[...new Set(requestedGoogle)].join(", ")}`);
  if (!r.faces.length || r.faces.some((face) => face.status !== "loaded")) fail(`JetBrains Mono deveria estar carregada: ${JSON.stringify(r.faces)}`);
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(r, "\nerrors:", errors);
await browser.close();
