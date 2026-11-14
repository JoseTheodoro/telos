// Fatia 1 (#16): home vazia → novo canvas → parede com foco → voltar (barra e navegador) → reload, sem violar a CSP.
import { chromium } from "playwright-core";
import { openTelos, telosUrl } from "../target.mjs";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));

const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
const savedIndex = () => page.evaluate(() => JSON.parse(localStorage.getItem("telos:boards") ?? "null"));
const listItems = () => page.locator(".board-list .board-link");
const wallHasFocus = () => page.evaluate(() => document.activeElement?.classList.contains("wall") ?? false);

try {
  await openTelos(page);
  await page.waitForSelector(".home");
  r.empty = {
    invite: await page.getByRole("button", { name: "Novo canvas" }).count(),
    items: await listItems().count(),
    index: await savedIndex(),
  };
  if (r.empty.invite !== 1 || r.empty.items !== 0) fail(`a primeira abertura deveria mostrar só o convite: ${JSON.stringify(r.empty)}`);

  await page.getByRole("button", { name: "Novo canvas" }).click();
  await page.waitForSelector(".wall");
  r.created = { hash: new URL(page.url()).hash, title: await page.textContent(".canvas-title"), wallFocused: await wallHasFocus() };
  if (!r.created.hash.startsWith("#/canvas/")) fail(`"Novo canvas" deveria abrir o canvas numa interação: ${r.created.hash}`);
  if (!r.created.wallFocused) fail("o canvas novo deveria abrir com o foco na parede");
  const boardId = decodeURIComponent(r.created.hash.slice("#/canvas/".length));
  const savedBoard = await page.evaluate((id) => JSON.parse(localStorage.getItem(`telos:board:${id}`) ?? "null"), boardId);
  if (savedBoard?.schema !== "telos/v1" || savedBoard?.id !== boardId) fail(`o canvas deveria estar salvo em telos/v1: ${JSON.stringify(savedBoard)}`);

  await page.getByRole("link", { name: "Voltar à home" }).click();
  await page.waitForSelector(".board-list");
  r.listed = { items: await listItems().count(), title: await page.textContent(".board-title"), date: await page.textContent(".board-date") };
  if (r.listed.items !== 1 || r.listed.title !== r.created.title || !r.listed.date) fail(`a home deveria listar o canvas com nome e data: ${JSON.stringify(r.listed)}`);

  await listItems().first().click();
  await page.waitForSelector(".wall");
  await page.goBack();
  await page.waitForSelector(".board-list");
  r.browserBack = new URL(page.url()).hash;
  if (r.browserBack !== "#/") fail(`o Voltar do navegador deveria levar à home: ${r.browserBack}`);

  await page.reload();
  await page.waitForSelector(".board-list");
  r.afterReload = await listItems().count();
  if (r.afterReload !== 1) fail(`o canvas deveria continuar na lista depois do reload: ${r.afterReload}`);

  await page.goto(telosUrl("#/canvas/nao-existe"));
  await page.waitForSelector(".home");
  r.unknownId = new URL(page.url()).hash;
  if (r.unknownId !== "#/") fail(`um id inexistente deveria voltar para a home: ${r.unknownId}`);
} catch (err) {
  r.FAILED = err.message.split("\n")[0];
}
console.log(r, "\nerrors:", errors);
await browser.close();
