import { chromium } from "playwright-core";
import { appUrl, expectInlineHandlerBlocks, openApp, watchCspViolations } from "./target.mjs";
import fs from "node:fs";
const [, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1540, height: 920 }, acceptDownloads: true });
const page = await ctx.newPage();
const inlineBlocks = expectInlineHandlerBlocks(page);
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && !inlineBlocks.isExpectedConsoleError(m.text()) && errors.push(m.text()));
page.on("dialog", (d) => d.accept());
await openApp(page); await page.waitForSelector(".node");
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const r = {};
try {
  await page.click('[data-focus-chapter="consulta"]');
  await page.click('[data-area="docs"]');
  r.area = { docsVisible: await page.isVisible("#docsView"), canvasHidden: await page.isHidden("#stage") };
  // nova nota já vinculada ao recorte (capítulo)
  await page.click(".docs-empty [data-doc-new]");
  await page.keyboard.type("Ata da pré-consulta");
  await page.keyboard.press("Enter"); // vai para o corpo
  await page.keyboard.type("## Decisões\n- [ ] validar triagem com a TI\n\n");
  await page.selectOption("#mdLang", "sql");
  await page.click('[data-md="codeblock"]');
  await page.keyboard.type("select * from atendimento where status = 'aberto';");
  await page.waitForTimeout(450); // o caderno grava 300 ms depois da última tecla
  let w = await ws(); let d = w.docs[0];
  r.saved = { title: d.title, link: d.link, hasSql: d.body.includes("```sql\nselect"), count: await page.textContent("#docsCount") };
  r.preview = { h2: await page.$$eval("#docPreview h2", (x) => x.map((e) => e.textContent)), sqlKw: await page.$$eval("#docPreview .hljs-keyword", (x) => x.length), task: await page.$$eval("#docPreview input[type=checkbox]", (x) => x.length) };
  // atalhos do canvas desligados no caderno
  await page.click("#docPreview");
  const nodesBefore = w.canvasNotes.length + w.decisions.length;
  await page.keyboard.press("t"); await page.keyboard.press("h"); await page.keyboard.press("Delete");
  w = await ws(); r.shortcutsOff = w.canvasNotes.length + w.decisions.length === nodesBefore && w.docs.length === 1;
  // tarefa clicável na pré-visualização
  await page.click("#docPreview input[type=checkbox]");
  w = await ws(); r.taskToggled = w.docs[0].body.includes("- [x] validar");
  // Ctrl+B na seleção
  await page.click("#docBody"); await page.keyboard.press("Meta+End"); await page.keyboard.type("\nimportante");
  await page.keyboard.down("Shift"); for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft"); await page.keyboard.up("Shift");
  await page.keyboard.press("Meta+b");
  await page.waitForTimeout(450);
  w = await ws(); r.bold = w.docs[0].body.endsWith("**importante**");
  // segunda nota sem vínculo; filtros
  await page.click(".docs-list-head [data-doc-new]");
  await page.keyboard.type("Comandos úteis");
  await page.selectOption("#docLink", "");
  w = await ws();
  r.secondUnlinked = w.docs.find((x) => x.title === "Comandos úteis")?.link === "";
  r.filterScope = await page.$$eval(".doc-row strong", (x) => x.map((e) => e.textContent));
  await page.click('[data-docs-filter="all"]'); r.filterAll = await page.$$eval(".doc-row", (x) => x.length);
  await page.click('[data-docs-filter="unlinked"]'); r.filterUnlinked = await page.$$eval(".doc-row strong", (x) => x.map((e) => e.textContent));
  await page.click('[data-docs-filter="all"]');
  await page.fill("#docsSearch", "atendimento"); r.search = await page.$$eval(".doc-row strong", (x) => x.map((e) => e.textContent));
  await page.fill("#docsSearch", "");
  // modos
  await page.click(".doc-row >> text=Ata da pré-consulta");
  await page.click('[data-docs-mode="view"]'); r.viewMode = { src: await page.$$eval("#docBody", (x) => x.length), prev: await page.$$eval("#docPreview", (x) => x.length) };
  await page.click('[data-docs-mode="split"]');
  await page.screenshot({ path: `${SHOTS}/docs-1.png` });
  // export .md
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-doc-export]")]);
  const md = fs.readFileSync(await dl.path(), "utf8");
  r.exportMd = { name: dl.suggestedFilename(), head: md.split("\n")[0], link: md.includes("> Cap. 02 · A consulta") };
  // ver no canvas → volta ao canvas no capítulo; inspetor lista a nota
  await page.click("[data-doc-goto]");
  r.backToCanvas = { stage: await page.isVisible("#stage"), inspector: await page.textContent("#inspectTitle") };
  r.inspectorDocs = await page.$$eval("[data-open-doc]", (x) => x.map((e) => e.textContent.trim()));
  await page.click("[data-open-doc]");
  r.openFromInspector = { area: await page.isVisible("#docsView"), title: await page.inputValue("#docTitle") };
  // excluir + undo
  await page.click("[data-doc-delete]");
  w = await ws(); r.deleted = w.docs.length;
  await page.click("#docsView .docs-list-foot"); // fora de campos
  await page.keyboard.press("Meta+z");
  w = await ws(); r.undoDelete = w.docs.length;
  // XSS no markdown
  await page.click(".doc-row >> text=Comandos úteis");
  await inlineBlocks.during(async () => {
    await page.fill("#docBody", '<img src="data:," onerror="window.__x=1"><a href="javascript:window.__x=2">x</a><iframe src="about:blank"></iframe>');
    await page.waitForTimeout(250);
  });
  r.xss = await page.evaluate(() => ({ x: window.__x ?? null, onerror: document.querySelectorAll("#docPreview [onerror]").length, jsHref: [...document.querySelectorAll("#docPreview a")].filter((a) => a.getAttribute("href")?.startsWith("javascript")).length, iframe: document.querySelectorAll("#docPreview iframe").length }));
  if (inlineBlocks.verdict()) r.FAILED ??= inlineBlocks.verdict();
  // persistência da área e da nota aberta
  await page.close();
  const p2 = await ctx.newPage(); p2.on("pageerror", (e) => errors.push(e.message));
  await watchCspViolations(p2);
  const reopenBlocks = expectInlineHandlerBlocks(p2);
  await reopenBlocks.during(async () => {
    await p2.goto(appUrl()); await p2.waitForSelector("#docsView:not([hidden])");
  });
  r.reopen = { title: await p2.inputValue("#docTitle"), docs: await p2.textContent("#docsCount") };
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(JSON.stringify(r, null, 1), "\nerrors:", errors);
await browser.close();
