import { chromium } from "playwright-core";
import fs from "node:fs";
const [ROOT, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1540, height: 920 }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const dialogs = []; page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
await page.goto(`file://${ROOT}/dist/index.html`); await page.waitForSelector(".node");
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem("pep-atlas-studio-v4")));
const last = async () => { const w = await ws(); return w.canvasNotes[w.canvasNotes.length - 1]; };
const r = {};
try {
  await page.click('[data-focus-scene="preconsulta"]');
  // botão: nota nova abre editor; vazia é descartada
  await page.click("#quickNoteBtn");
  r.editorOpen = await page.isVisible(".note-editor");
  await page.keyboard.press("Escape");
  r.emptyDiscarded = (await ws()).canvasNotes.length === 0;
  // nota SQL
  await page.click("#quickNoteBtn");
  await page.keyboard.type("SELECT p.id, p.nome\nFROM pacientes p\nWHERE p.cpf = :cpf;");
  await page.keyboard.press("Escape");
  let n = await last();
  r.saved = n.text.startsWith("SELECT") && n.scope === "scene:preconsulta";
  const k = `[data-node="note:${n.id}"]`;
  await page.click(k + " .note-head .note-fmt");
  await page.selectOption('[data-field="format"]', "sql");
  r.sql = { code: await page.getAttribute(k, "data-code"), keywords: await page.$$eval(k + " .hljs-keyword", (x) => x.map((e) => e.textContent).slice(0, 3)) };
  // undo da troca de formato
  await page.keyboard.press("Meta+z");
  r.undoFormat = (await last()).format;
  await page.keyboard.press("Meta+Shift+z");
  // copiar
  await page.click(k + " [data-note-copy]");
  r.clipboard = (await page.evaluate(() => navigator.clipboard.readText())).split("\n")[0];
  // redimensionar
  const grip = await page.locator(k + " .note-resize").boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
  await page.mouse.move(grip.x + 120, grip.y + 80, { steps: 5 }); await page.mouse.up();
  n = await last(); r.resized = { w: n.w, h: n.h };
  await page.keyboard.press("Meta+z"); n = await last(); r.resizeUndo = { w: n.w, h: n.h };
  // duplo clique edita; Tab indenta
  const body = await page.locator(k + " .note-body").boundingBox();
  await page.mouse.dblclick(body.x + 40, body.y + 20);
  r.dblEdit = await page.isVisible(k + " .note-editor");
  await page.keyboard.press("Meta+ArrowDown"); await page.keyboard.press("Enter"); await page.keyboard.press("Tab"); await page.keyboard.type("AND p.ativo");
  await page.keyboard.press("Meta+Enter");
  r.tabIndent = (await last()).text.endsWith("\n  AND p.ativo");
  // atalho T no cursor, JSON inválido → aviso; válido → formatar
  const st = await page.locator("#stage").boundingBox();
  await page.click('[data-node^="note:"]'); // seleciona algo e libera o teclado
  await page.keyboard.press("Escape");
  await page.mouse.move(st.x + 300, st.y + 200);
  await page.keyboard.press("t");
  await page.keyboard.type('{"cpf": "123", "ativo": true');
  await page.keyboard.press("Meta+Enter");
  const j = await last();
  const jk = `[data-node="note:${j.id}"]`;
  r.atCursor = await page.$eval(jk, (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y) }; });
  r.cursorTarget = { x: Math.round(st.x + 300), y: Math.round(st.y + 200) };
  await page.click(jk + " .note-fmt");
  await page.selectOption('[data-field="format"]', "json");
  r.jsonWarn = await page.$$eval(jk + " .note-warn", (x) => x.length);
  await page.fill('[data-field="text"]', '{"cpf":"123","ativo":true,"alergias":["dipirona"]}');
  await page.locator('[data-field="text"]').blur();
  await page.click('[data-note-act="pretty"]');
  r.pretty = (await last()).text.split("\n").length;
  // Markdown sanitizado
  await page.selectOption('[data-field="format"]', "markdown");
  await page.fill('[data-field="text"]', "# Título\n\n- item **forte**\n\n<img src=x onerror=\"window.__xss=1\">\n<script>window.__xss=2</script>\n\n```sql\nselect 1\n```");
  await page.locator('[data-field="text"]').blur();
  await page.waitForTimeout(100);
  r.markdown = { h1: await page.$$eval(jk + " .md h1", (x) => x.length), strong: await page.$$eval(jk + " .md strong", (x) => x.length), sqlBlock: await page.$$eval(jk + " .md pre.md-code .hljs-keyword", (x) => x.length) };
  r.xss = await page.evaluate(() => ({ flag: window.__xss ?? null, onerror: document.querySelectorAll("[onerror]").length, scripts: document.querySelectorAll(".md script").length }));
  // roda dentro de nota com rolagem não dá zoom
  await page.selectOption('[data-field="format"]', "bash");
  await page.fill('[data-field="text"]', Array.from({ length: 40 }, (_, i) => `echo "linha ${i}" | grep linha`).join("\n"));
  await page.locator('[data-field="text"]').blur();
  const zBefore = await page.textContent("#zoomLabel");
  const nb = await page.locator(jk + " .note-body").boundingBox();
  await page.mouse.move(nb.x + 40, nb.y + 40); await page.mouse.wheel(0, 120); await page.waitForTimeout(150);
  r.wheel = { zoomSame: zBefore === (await page.textContent("#zoomLabel")), scrolled: await page.$eval(jk + " .note-body", (b) => b.scrollTop > 0) };
  // Organizar não move a nota
  const before = (await ws()).graph.layouts;
  await page.click("#layoutBtn");
  const after = (await ws()).graph.layouts;
  const key = Object.keys(after).find((x) => after[x][`note:${j.id}`]);
  r.organizeKeeps = JSON.stringify(before[key][`note:${j.id}`]) === JSON.stringify(after[key][`note:${j.id}`]);
  await page.screenshot({ path: `${SHOTS}/notes-1.png` });
  // recorte: some em outro capítulo, aparece no mapa completo e em Camadas
  await page.click('[data-focus-chapter="inicio"]').catch(async () => { const w = await ws(); await page.click(`[data-focus-chapter="${w.chapters[0].id}"]`); });
  r.hiddenElsewhere = await page.$$eval('[data-node^="note:"]', (x) => x.length);
  await page.click('[data-focus-all="yes"]');
  r.fullMap = await page.$$eval('[data-node^="note:"]', (x) => x.length);
  await page.click('[data-focus-scene="preconsulta"]');
  await page.click('[data-layout="layers"]');
  r.layers = await page.$$eval('[data-node^="note:"]', (x) => x.length);
  await page.click('[data-layout="timeline"]');
  // inventário encontra pelo conteúdo e abre o recorte
  await page.click('[data-tab="inventory"]'); await page.fill("#search", "pacientes p");
  r.inventory = await page.$$eval('.inventory-item[data-select-node^="note:"]', (x) => x.length);
  // SVG
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#svgBtn")]);
  const svg = fs.readFileSync(await dl.path(), "utf8");
  r.svg = svg.includes("SELECT p.id") && svg.includes(">SQL<");
  await page.reload(); await page.waitForSelector('[data-node^="note:"]');
  r.reload = (await ws()).canvasNotes.length;
} catch (err) { r.FAILED = err.message.split("\n")[0]; }
console.log(JSON.stringify(r, null, 1), "\nerrors:", errors, "dialogs:", dialogs);
await browser.close();
