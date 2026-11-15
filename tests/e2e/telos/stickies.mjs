// Fatia 2 (#17): Domain Event pela tecla 1 e por duplo clique, edição inline, altura que cresce e reload.
import { chromium } from "playwright-core";
import { openTelos } from "../target.mjs";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));

const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
const stickies = () => page.locator(".sticky");
const editing = () => page.evaluate(() => document.activeElement?.isContentEditable === true && !!document.activeElement.closest(".sticky"));
const selectedCount = () => page.locator(".sticky.is-selected").count();
const boxes = () => stickies().evaluateAll((nodes) => nodes.map((n) => { const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }));
const savedBoard = () =>
  page.evaluate(() => {
    const id = decodeURIComponent(location.hash.slice("#/canvas/".length));
    return JSON.parse(localStorage.getItem(`telos:board:${id}`) ?? "null");
  });

try {
  await openTelos(page);
  await page.getByRole("button", { name: "Novo canvas" }).click();
  await page.waitForSelector(".wall");

  await page.mouse.move(600, 400);
  await page.keyboard.press("1");
  await page.waitForSelector(".sticky");
  const [first] = await boxes();
  r.byKey = { count: await stickies().count(), editing: await editing(), box: first };
  if (r.byKey.count !== 1 || !r.byKey.editing) fail(`a tecla 1 deveria criar um post-it em edição: ${JSON.stringify(r.byKey)}`);
  if (!(first.x <= 600 && 600 <= first.x + first.w && first.y <= 400 && 400 <= first.y + first.h)) fail(`o post-it deveria nascer no cursor: ${JSON.stringify(first)}`);

  await page.keyboard.type("Pedido faturado 1");
  r.typed = { count: await stickies().count(), text: await page.locator(".sticky-text").first().textContent() };
  if (r.typed.count !== 1 || r.typed.text !== "Pedido faturado 1") fail(`digitar "1" no texto não deveria criar outro post-it: ${JSON.stringify(r.typed)}`);

  await page.mouse.click(first.x + first.w / 2, first.y + first.h - 12);
  r.clickInside = await editing();
  if (!r.clickInside) fail("clicar dentro do post-it em edição não deveria encerrar a edição");
  await page.locator(".sticky-text").first().dblclick({ position: { x: 12, y: 8 } });
  r.wordSelection = await page.evaluate(() => window.getSelection()?.toString());
  if (!(await editing()) || !r.wordSelection) fail(`o duplo clique na edição deveria selecionar uma palavra: ${JSON.stringify(r.wordSelection)}`);

  await page.keyboard.press("Escape");
  r.afterEscape = { editing: await editing(), selected: await selectedCount() };
  if (r.afterEscape.editing || r.afterEscape.selected !== 0) fail(`Esc deveria sair da edição e limpar a seleção: ${JSON.stringify(r.afterEscape)}`);
  r.wallRing = await page.evaluate(() => {
    const wall = document.activeElement;
    return wall?.classList.contains("wall") ? getComputedStyle(wall).outlineStyle : "foco fora da parede";
  });
  if (r.wallRing !== "none") fail(`depois do Esc o foco volta à parede sem moldura de foco: ${r.wallRing}`);

  await page.mouse.dblclick(300, 700);
  await stickies().nth(1).waitFor();
  r.byDoubleClick = { editing: await editing() };
  if (!r.byDoubleClick.editing) fail("o duplo clique no fundo deveria criar um post-it em edição");
  const minHeight = (await boxes())[1].h;
  for (const [index, line] of ["Nota fiscal", "emitida", "para o", "cliente", "final"].entries()) {
    if (index) await page.keyboard.press("Enter");
    await page.keyboard.type(line);
  }
  r.grown = { min: minHeight, after: (await boxes())[1].h };
  if (!(r.grown.after > r.grown.min)) fail(`um texto longo deveria aumentar a altura: ${JSON.stringify(r.grown)}`);
  await page.keyboard.press("Escape");

  await stickies().nth(1).click();
  await page.keyboard.press("Enter");
  r.enterReopens = await editing();
  if (!r.enterReopens) fail("Enter no post-it selecionado deveria reabrir a edição");
  await page.mouse.click(1100, 200);
  r.clickOutside = { editing: await editing(), selected: await selectedCount() };
  if (r.clickOutside.editing || r.clickOutside.selected !== 0) fail(`o clique no fundo deveria sair da edição e limpar a seleção: ${JSON.stringify(r.clickOutside)}`);

  await stickies().first().click();
  await page.keyboard.press("Escape");
  r.escapeClears = await selectedCount();
  if (r.escapeClears !== 0) fail(`Esc sem edição deveria limpar a seleção: ${r.escapeClears}`);

  await page.getByRole("link", { name: "Voltar à home" }).focus();
  await page.keyboard.press("Tab");
  r.wallRingOnEntry = await page.evaluate(() => {
    const wall = document.activeElement;
    return wall?.classList.contains("wall") ? getComputedStyle(wall).outlineStyle : "foco fora da parede";
  });
  if (r.wallRingOnEntry !== "solid") fail(`entrar na parede pelo teclado deveria mostrar o foco: ${r.wallRingOnEntry}`);
  await page.keyboard.press("Tab");
  r.tabFocus = { selected: await selectedCount() };
  await page.keyboard.press("Enter");
  r.tabFocus.editing = await editing();
  if (r.tabFocus.selected !== 1 || !r.tabFocus.editing) fail(`o post-it focado por Tab deveria ficar selecionado e abrir com Enter: ${JSON.stringify(r.tabFocus)}`);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  const before = await boxes();
  await page.reload();
  await stickies().nth(1).waitFor();
  const after = await boxes();
  r.reload = { texts: await page.locator(".sticky-text").allTextContents(), before, after };
  if (r.reload.texts[0] !== "Pedido faturado 1" || r.reload.texts[1] !== "Nota fiscal\nemitida\npara o\ncliente\nfinal") fail(`o reload deveria preservar os textos: ${JSON.stringify(r.reload.texts)}`);
  if (JSON.stringify(before) !== JSON.stringify(after)) fail("o reload deveria preservar posição e tamanho");

  const saved = await savedBoard();
  r.saved = saved?.stickies?.map(({ kind, x, y, w, h }) => ({ kind, x, y, w, h }));
  const finite = (n) => typeof n === "number" && Number.isFinite(n);
  if (!r.saved || r.saved.length !== 2 || r.saved.some((s) => s.kind !== "domainEvent" || ![s.x, s.y, s.w, s.h].every(finite))) fail(`o documento salvo deveria ter dois Domain Events válidos: ${JSON.stringify(r.saved)}`);
  if (r.saved?.some((s, i) => Math.round(after[i].w) !== s.w || Math.round(after[i].h) !== s.h)) fail(`w e h salvos deveriam bater com o tamanho renderizado: ${JSON.stringify({ saved: r.saved, after })}`);
} catch (err) {
  r.FAILED = err.message.split("\n")[0];
}
console.log(r, "\nerrors:", errors);
await browser.close();
