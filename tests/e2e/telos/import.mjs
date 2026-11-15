// FN-04 · Fatia 1 (#31): importar um canvas telos/v1 pela home; arquivo inválido mostra o motivo e não grava nada.
import { chromium } from "playwright-core";
import { openTelos } from "../target.mjs";

const PAYLOAD = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));

const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
const sticky = (id, text, x) => ({ id, kind: "domainEvent", text, x, y: 120, w: 200, h: 120 });
const faturamento = { schema: "telos/v1", id: "origem", title: "Faturamento", stickies: [sticky("s-1", "Pedido faturado", 100), sticky("s-2", "Nota emitida", 340)] };
const jsonFile = (name, content) => ({ name, mimeType: "application/json", buffer: Buffer.from(typeof content === "string" ? content : JSON.stringify(content)) });
const currentId = () => decodeURIComponent(new URL(page.url()).hash.slice("#/canvas/".length));
const savedBoard = (id) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), `telos:board:${id}`);
const savedIndex = () => page.evaluate(() => localStorage.getItem("telos:boards"));
const boardKeys = () => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("telos:board:")).sort());
const importButton = () => page.getByRole("button", { name: "Importar" });

async function importThroughChooser(file) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), importButton().click()]);
  await chooser.setFiles(file);
}

async function goHome() {
  await page.getByRole("link", { name: "Voltar à home" }).click();
  await page.waitForSelector(".home");
}

try {
  await openTelos(page);
  await page.waitForSelector(".home-invite");
  r.invite = await importButton().count();
  if (r.invite !== 1) fail(`a home vazia deveria oferecer "Importar": ${r.invite}`);

  await importButton().focus();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Enter")]);
  await chooser.setFiles(jsonFile("faturamento.telos.json", faturamento));
  await page.waitForSelector(".wall");
  const firstId = currentId();
  r.imported = {
    id: firstId,
    title: await page.textContent(".canvas-title"),
    texts: await page.locator(".sticky-text").allTextContents(),
    saved: await savedBoard(firstId),
  };
  if (!firstId || firstId === faturamento.id) fail(`o canvas importado deveria ganhar um id novo: ${firstId}`);
  if (r.imported.title !== "Faturamento" || r.imported.texts.join("|") !== "Pedido faturado|Nota emitida") fail(`o canvas importado deveria abrir com o conteúdo do arquivo: ${JSON.stringify(r.imported)}`);
  if (JSON.stringify(r.imported.saved) !== JSON.stringify({ ...faturamento, id: firstId })) fail(`o documento salvo deveria ser o do arquivo com o id novo: ${JSON.stringify(r.imported.saved)}`);

  await goHome();
  await importThroughChooser(jsonFile("faturamento.telos.json", faturamento));
  await page.waitForSelector(".wall");
  const secondId = currentId();
  await goHome();
  r.twice = { ids: [firstId, secondId], listed: await page.locator(".board-link").count() };
  if (secondId === firstId || r.twice.listed !== 2) fail(`importar duas vezes deveria criar dois canvas: ${JSON.stringify(r.twice)}`);

  const defective = {
    schema: "telos/v1",
    id: "defeituoso",
    title: "Defeituoso",
    stickies: [{ ...sticky("a", "ok", 0), x: "10" }, { ...sticky("b", "ok", 0), kind: "command" }, sticky("a", "ok", 0), { ...sticky("c", 7, 0), w: null }],
  };
  const rejected = [
    { name: "nao-json", file: jsonFile("nao.json", "{ não é json"), expect: ["O arquivo não é um JSON válido."] },
    { name: "atlas", file: jsonFile("atlas.json", { schema: "pep-atlas-studio-v4", journeys: [] }), expect: ["O arquivo não é um canvas telos/v1."] },
    {
      name: "defeituoso",
      file: jsonFile("defeituoso.json", defective),
      expect: ["post-it 1, posição x: deveria ser um número", "post-it 2, tipo: desconhecido", "post-it 3, id: id repetido", "e mais 2 problemas"],
    },
  ];
  r.rejected = {};
  for (const { name, file, expect } of rejected) {
    const indexBefore = await savedIndex();
    const keysBefore = await boardKeys();
    await importThroughChooser(file);
    await page.locator(".home-problems li", { hasText: expect[0] }).first().waitFor({ timeout: 3000 }).catch(() => {});
    const shown = await page.locator(".home-problems li").allTextContents();
    const unchanged = (await savedIndex()) === indexBefore && JSON.stringify(await boardKeys()) === JSON.stringify(keysBefore);
    r.rejected[name] = { shown, unchanged, hash: new URL(page.url()).hash };
    if (JSON.stringify(shown) !== JSON.stringify(expect)) fail(`${name}: o motivo deveria ser ${JSON.stringify(expect)}: ${JSON.stringify(shown)}`);
    if (!unchanged || r.rejected[name].hash !== "#/") fail(`${name}: uma importação recusada não deveria gravar nada: ${JSON.stringify(r.rejected[name])}`);
  }
  r.alertRole = await page.locator(".home-problems").getAttribute("role");
  if (r.alertRole !== "alert") fail(`os problemas da importação deveriam estar numa região role="alert": ${r.alertRole}`);

  const poisoned = { schema: "telos/v1", id: "envenenado", title: PAYLOAD, stickies: [sticky("s", PAYLOAD, 100)] };
  await importThroughChooser(jsonFile("envenenado.json", poisoned));
  await page.waitForSelector(".sticky");
  r.xss = {
    title: await page.textContent(".canvas-title"),
    text: await page.locator(".sticky-text").textContent(),
    images: await page.locator("#app img").count(),
    xss: await page.evaluate(() => window.__xss),
  };
  if (r.xss.title !== PAYLOAD || r.xss.text !== PAYLOAD || r.xss.images || r.xss.xss !== undefined) fail(`a marcação de um arquivo importado deveria aparecer como texto: ${JSON.stringify(r.xss)}`);
  await goHome();
  r.homeTitles = await page.locator(".board-title").allTextContents();
  if (r.homeTitles[0] !== PAYLOAD || (await page.locator("#app img").count())) fail(`o título importado deveria aparecer como texto na home: ${JSON.stringify(r.homeTitles)}`);
} catch (err) {
  r.FAILED = err.message.split("\n")[0];
}
console.log(r, "\nerrors:", errors);
await browser.close();
