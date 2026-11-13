import { chromium } from "playwright-core";
import { openApp } from "./target.mjs";
const [, SHOTS] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1540, height: 920 } })).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", (d) => d.accept());
await openApp(page); await page.waitForSelector(".node");
await page.click('[data-focus-scene="preconsulta"]');
await page.click("#zoomIn"); await page.click("#zoomIn");
const results = {};
const node = (kind, i = 0) => page.locator(`.node[data-kind="${kind}"]`).nth(i);
const center = async (loc) => { const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + 22]; };
const undoDisabled = () => page.locator("#undo").isDisabled();
const emptyStagePoint = () =>
  page.evaluate(() => {
    const stage = document.querySelector("#stage").getBoundingClientRect();
    for (let y = stage.bottom - 24; y > stage.top + 24; y -= 16)
      for (let x = stage.left + 24; x < stage.right - 24; x += 16) {
        const el = document.elementFromPoint(x, y);
        if (el?.closest("#stage") && !el.closest("[data-node],[data-edge],[data-emo-scene],#esLegend,.zoomhud,button")) return [x, y];
      }
    throw new Error("nenhum ponto vazio no canvas");
  });
const originalScene = await node("scene").locator(".name").textContent();
const originalEvent = await node("event").locator(".name").textContent();
const originalChapter = await node("chapter").locator(".name").textContent();

// 1) duplo clique abre editor com texto selecionado e não abre modal
let [x, y] = await center(node("scene"));
await page.mouse.dblclick(x, y);
results.editorOpen = await page.locator(".name-editor").count();
results.modalOpen = await page.$eval("#modal", (m) => m.open);
results.selectedText = await page.$eval(".name-editor", (t) => t.value.slice(t.selectionStart, t.selectionEnd));
await page.screenshot({ path: `${SHOTS}/inline-1.png` });
// 2) digitar + Enter salva
await page.keyboard.type("Enfermagem afere os sinais vitais");
await page.keyboard.press("Enter");
results.afterEnter = await node("scene").locator(".name").textContent();
results.sidebarUpdated = (await page.textContent('[data-focus-scene="preconsulta"]')).includes("Enfermagem afere os sinais vitais");
results.inspectorTitle = await page.textContent("#inspectTitle");
// 3) Ctrl+Z desfaz
await page.keyboard.press("Meta+z");
results.afterUndo = await node("scene").locator(".name").textContent();
// 4) Escape cancela
[x, y] = await center(node("event"));
await page.mouse.dblclick(x, y);
await page.keyboard.type("NÃO DEVE SALVAR");
await page.keyboard.press("Escape");
results.afterEscape = await node("event").locator(".name").textContent();
// 5) F2 + clicar em outro card confirma
[x, y] = await center(node("event"));
await page.mouse.click(x, y);
await page.keyboard.press("F2");
await page.keyboard.type("PreConsultaIniciada (F2)");
[x, y] = await center(node("chapter"));
await page.mouse.click(x, y);
results.afterF2ClickOther = await node("event").locator(".name").textContent();
results.selectedAfter = await page.$eval(".node.selected", (n) => n.dataset.kind);
// 6) nome vazio é rejeitado
[x, y] = await center(node("chapter"));
await page.mouse.dblclick(x, y);
await page.keyboard.press("Backspace");
await page.keyboard.press("Enter");
results.emptyRejected = await node("chapter").locator(".name").textContent();
// 7) clicar no fundo confirma (blur) e não cria pan estranho
[x, y] = await center(node("journey"));
await page.mouse.dblclick(x, y);
await page.keyboard.press("End");
await page.keyboard.type(" ✓");
await page.mouse.click(...(await emptyStagePoint()));
results.afterBlurBackground = await node("journey").locator(".name").textContent();
// 8) duplo clique no fundo ainda abre modal de criação
await page.mouse.dblclick(...(await emptyStagePoint()));
results.bgDblclickModal = await page.$eval("#modal", (m) => m.open);
await page.keyboard.press("Escape");
// 9) inspetor: título acompanha digitação; focar sem alterar não cria undo
await page.reload(); await page.waitForSelector(".node");
[x, y] = await center(node("scene")); await page.mouse.click(x, y);
results.undoBeforeFocus = await undoDisabled();
await page.click('[data-field="title"]'); await page.click('[data-field="time"]'); await page.click('[data-field="actor"]');
results.undoAfterFocusOnly = await undoDisabled();
await page.click('[data-field="title"]'); await page.keyboard.press("End"); await page.keyboard.type(" (ao vivo)");
results.inspectorLiveTitle = await page.textContent("#inspectTitle");
results.undoAfterTyping = await undoDisabled();
await page.screenshot({ path: `${SHOTS}/inline-2.png` });
const fail = (msg) => { if (!results.FAILED) results.FAILED = msg; };
if (results.editorOpen !== 1 || results.modalOpen) fail("duplo clique no card deveria abrir o editor, sem modal");
if (results.selectedText !== originalScene) fail(`editor deveria abrir com o nome inteiro selecionado: ${results.selectedText}`);
if (results.afterEnter !== "Enfermagem afere os sinais vitais" || !results.sidebarUpdated || results.inspectorTitle !== results.afterEnter) fail("Enter não gravou o nome no card, na árvore e no inspetor");
if (results.afterUndo !== originalScene) fail(`Ctrl+Z não desfez a edição: ${results.afterUndo}`);
if (results.afterEscape !== originalEvent) fail(`Escape deveria descartar a edição: ${results.afterEscape}`);
if (results.afterF2ClickOther !== "PreConsultaIniciada (F2)" || results.selectedAfter !== "chapter") fail("F2 + clique em outro card deveria gravar e selecionar o outro card");
if (results.emptyRejected !== originalChapter) fail(`nome vazio deveria ser rejeitado: ${results.emptyRejected}`);
if (!results.afterBlurBackground.endsWith(" ✓")) fail(`clique no fundo deveria gravar a edição: ${results.afterBlurBackground}`);
if (!results.bgDblclickModal) fail("duplo clique no fundo deveria abrir o modal de criação");
if (!results.undoBeforeFocus || !results.undoAfterFocusOnly) fail("focar campos do inspetor sem alterar não pode criar undo");
if (!results.inspectorLiveTitle.includes("(ao vivo)") || results.undoAfterTyping) fail("título do inspetor deveria acompanhar a digitação e habilitar o undo");
console.log(results, "\nerrors:", errors);
await browser.close();
