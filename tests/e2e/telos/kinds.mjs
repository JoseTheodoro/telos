// Fatia 3 (#18): os cinco tipos pelas teclas 1–5 e pela toolbar, troca de tipo, Hotspot inclinado e reload.
import { chromium } from "playwright-core";
import { openTelos } from "../target.mjs";

const KINDS = [
  { key: "2", kind: "hotspot", label: "Hotspot", bg: "rgb(255, 222, 221)" },
  { key: "3", kind: "actor", label: "Actor", bg: "rgb(255, 243, 168)" },
  { key: "4", kind: "externalSystem", label: "External System", bg: "rgb(253, 225, 238)" },
  { key: "5", kind: "aggregate", label: "Aggregate", bg: "rgb(251, 241, 217)" },
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));

const r = {};
const fail = (msg) => { if (!r.FAILED) r.FAILED = msg; };
const stickies = () => page.locator(".sticky");
const editing = () => page.evaluate(() => document.activeElement?.isContentEditable === true && !!document.activeElement.closest(".sticky"));
const describe = (locator) =>
  locator.evaluate((node) => ({
    kind: node.dataset.kind,
    label: node.getAttribute("aria-label"),
    bg: getComputedStyle(node, "::before").backgroundColor,
    beforeRotate: getComputedStyle(node, "::before").rotate,
    nodeRotate: getComputedStyle(node).rotate,
    nodeTransform: getComputedStyle(node).transform,
  }));

try {
  await openTelos(page);
  await page.getByRole("button", { name: "Novo canvas" }).click();
  await page.waitForSelector(".wall");

  r.byKey = [];
  for (const [index, expected] of KINDS.entries()) {
    await page.mouse.move(260 + index * 240, 260);
    await page.keyboard.press(expected.key);
    await stickies().nth(index).waitFor();
    const created = { ...(await describe(stickies().last())), editing: await editing() };
    r.byKey.push(created);
    if (created.kind !== expected.kind || created.label !== expected.label || created.bg !== expected.bg || !created.editing) {
      fail(`a tecla ${expected.key} deveria criar um ${expected.label} em edição: ${JSON.stringify(created)}`);
    }
    await page.keyboard.type(expected.label);
    await page.keyboard.press("Escape");
  }

  const hotspot = r.byKey[0];
  if (hotspot.beforeRotate === "none" || hotspot.nodeRotate !== "none" || hotspot.nodeTransform !== "none") {
    fail(`o Hotspot deveria inclinar só o fundo: ${JSON.stringify(hotspot)}`);
  }

  const toolbar = page.getByRole("toolbar", { name: "Post-its" });
  r.toolbar = await toolbar.getByRole("button").evaluateAll((buttons) =>
    buttons.map((b) => ({ label: b.getAttribute("aria-label"), title: b.title, shortcut: b.getAttribute("aria-keyshortcuts"), tabIndex: b.tabIndex })),
  );
  const expectedLabels = ["Domain Event", "Hotspot", "Actor", "External System", "Aggregate"];
  const expectedKinds = ["domainEvent", "hotspot", "actor", "externalSystem", "aggregate"];
  if (
    JSON.stringify(r.toolbar.map((b) => b.label)) !== JSON.stringify(expectedLabels) ||
    r.toolbar.some((b, i) => !b.title.includes(`(${i + 1})`) || b.shortcut !== String(i + 1))
  ) {
    fail(`a toolbar deveria ter os 5 tipos com o atalho no title e em aria-keyshortcuts: ${JSON.stringify(r.toolbar)}`);
  }
  if (r.toolbar.filter((b) => b.tabIndex === 0).length !== 1) fail(`a toolbar deveria ser uma única parada de Tab: ${JSON.stringify(r.toolbar)}`);

  await toolbar.getByRole("button", { name: "Domain Event" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  r.arrowFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  await page.keyboard.press("End");
  r.endFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  if (r.arrowFocus !== "Actor" || r.endFocus !== "Aggregate") fail(`as setas e End deveriam mover o foco na toolbar: ${JSON.stringify([r.arrowFocus, r.endFocus])}`);

  r.byToolbar = [];
  for (const [index, label] of expectedLabels.entries()) {
    const before = await stickies().count();
    await toolbar.getByRole("button", { name: label }).click();
    await stickies().nth(before).waitFor();
    const created = { ...(await describe(stickies().last())), editing: await editing() };
    r.byToolbar.push(created.kind);
    if (created.kind !== expectedKinds[index] || !created.editing) fail(`o botão ${label} deveria criar um ${label} em edição: ${JSON.stringify(created)}`);
    await page.keyboard.press("Escape");
  }

  r.ink = await stickies().first().evaluate((node) => getComputedStyle(node.querySelector(".sticky-text")).color);
  if (r.ink !== "rgb(29, 31, 35)") fail(`o texto do post-it deveria usar a tinta testada em AA (#1d1f23): ${r.ink}`);

  const countBeforeRetype = await stickies().count();
  await stickies().nth(1).click();
  await page.keyboard.press("4");
  r.retype = { ...(await describe(stickies().nth(1))), count: await stickies().count(), editing: await editing(), selected: await page.locator(".sticky.is-selected").count() };
  if (r.retype.kind !== "externalSystem" || r.retype.label !== "External System" || r.retype.count !== countBeforeRetype || r.retype.editing || r.retype.selected !== 1) {
    fail(`a tecla 4 no post-it selecionado deveria trocar o tipo, sem criar nem editar: ${JSON.stringify(r.retype)}`);
  }

  const domKinds = await stickies().evaluateAll((nodes) => nodes.map((n) => n.dataset.kind));
  await page.reload();
  await stickies().nth(domKinds.length - 1).waitFor();
  r.reload = {
    dom: await stickies().evaluateAll((nodes) => nodes.map((n) => n.dataset.kind)),
    saved: await page.evaluate(() => {
      const id = decodeURIComponent(location.hash.slice("#/canvas/".length));
      return JSON.parse(localStorage.getItem(`telos:board:${id}`) ?? "null")?.stickies?.map((s) => s.kind);
    }),
  };
  if (JSON.stringify(r.reload.dom) !== JSON.stringify(domKinds) || JSON.stringify(r.reload.saved) !== JSON.stringify(domKinds)) {
    fail(`os tipos deveriam persistir no reload: ${JSON.stringify({ before: domKinds, ...r.reload })}`);
  }
} catch (err) {
  r.FAILED = err.message.split("\n")[0];
}
console.log(r, "\nerrors:", errors);
await browser.close();
