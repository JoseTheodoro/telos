// Fatia 3 (#18): os cinco tipos pelas teclas 1–5 e pela toolbar, troca de tipo, Hotspot inclinado e reload.
import { chromium } from "playwright-core";
import { openTelos } from "../target.mjs";

const KINDS = [
  { key: "1", kind: "domainEvent", label: "Domain Event", bg: "rgb(255, 227, 196)" },
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
  for (const [index, expected] of KINDS.slice(1).entries()) {
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
    buttons.map((b) => ({
      label: b.textContent.trim(),
      ariaLabel: b.getAttribute("aria-label"),
      title: b.title,
      shortcut: b.getAttribute("aria-keyshortcuts"),
      tabIndex: b.tabIndex,
    })),
  );
  if (
    JSON.stringify(r.toolbar.map((b) => b.label)) !== JSON.stringify(KINDS.map(({ label }) => label)) ||
    r.toolbar.some((b, i) => b.ariaLabel !== b.label || !b.title.includes(`(${KINDS[i].key})`) || b.shortcut !== KINDS[i].key)
  ) {
    fail(`a toolbar deveria ter os 5 tipos com aria-label e o atalho no title e em aria-keyshortcuts: ${JSON.stringify(r.toolbar)}`);
  }
  if (r.toolbar.filter((b) => b.tabIndex === 0).length !== 1) fail(`a toolbar deveria ser uma única parada de Tab: ${JSON.stringify(r.toolbar)}`);

  await toolbar.getByRole("button", { name: "Domain Event" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  r.arrowFocus = await page.evaluate(() => document.activeElement?.textContent.trim());
  await page.keyboard.press("End");
  r.endFocus = await page.evaluate(() => document.activeElement?.textContent.trim());
  if (r.arrowFocus !== "Actor" || r.endFocus !== "Aggregate") fail(`as setas e End deveriam mover o foco na toolbar: ${JSON.stringify([r.arrowFocus, r.endFocus])}`);

  r.byToolbar = [];
  for (const { label, kind } of KINDS) {
    const before = await stickies().count();
    await toolbar.getByRole("button", { name: label }).click();
    await stickies().nth(before).waitFor();
    const created = { ...(await describe(stickies().last())), editing: await editing() };
    r.byToolbar.push(created.kind);
    if (created.kind !== kind || !created.editing) fail(`o botão ${label} deveria criar um ${label} em edição: ${JSON.stringify(created)}`);
    await page.keyboard.press("Escape");
  }
  await toolbar.getByRole("button", { name: "Actor" }).click();
  await page.keyboard.press("Escape");
  r.tabStopAfterClick = await toolbar.getByRole("button").evaluateAll((buttons) => buttons.filter((b) => b.tabIndex === 0).map((b) => b.textContent.trim()));
  if (JSON.stringify(r.tabStopAfterClick) !== JSON.stringify(["Actor"])) fail(`depois do clique, a parada de Tab da toolbar deveria ser o botão clicado: ${JSON.stringify(r.tabStopAfterClick)}`);

  const beforeKeyOnToolbar = await stickies().count();
  await toolbar.getByRole("button", { name: "Actor" }).focus();
  await page.keyboard.press("2");
  await stickies().nth(beforeKeyOnToolbar).waitFor({ timeout: 2000 }).catch(() => {});
  r.keyOnToolbar = { count: await stickies().count(), kind: await stickies().last().getAttribute("data-kind"), editing: await editing() };
  if (r.keyOnToolbar.count !== beforeKeyOnToolbar + 1 || r.keyOnToolbar.kind !== "hotspot" || !r.keyOnToolbar.editing) {
    fail(`a tecla 2 com o foco na toolbar deveria criar um Hotspot em edição: ${JSON.stringify(r.keyOnToolbar)}`);
  }
  await page.keyboard.press("Escape");

  const countBeforeToolbarRetype = await stickies().count();
  await stickies().first().click();
  await toolbar.getByRole("button", { name: "Actor" }).focus();
  await page.keyboard.press("5");
  r.retypeFromToolbar = { kind: await stickies().first().getAttribute("data-kind"), count: await stickies().count() };
  await page.keyboard.press("Escape");
  r.retypeFromToolbar.selectedAfterEscape = await page.locator(".sticky.is-selected").count();
  if (r.retypeFromToolbar.kind !== "aggregate" || r.retypeFromToolbar.count !== countBeforeToolbarRetype || r.retypeFromToolbar.selectedAfterEscape !== 0) {
    fail(`com o foco na toolbar, a tecla 5 deveria trocar o tipo do selecionado e o Esc limpar a seleção: ${JSON.stringify(r.retypeFromToolbar)}`);
  }

  await page.locator(".canvas-title").click();
  await page.keyboard.press("3");
  await stickies().nth(countBeforeToolbarRetype).waitFor({ timeout: 2000 }).catch(() => {});
  r.keyAfterChromeClick = { count: await stickies().count(), kind: await stickies().last().getAttribute("data-kind"), editing: await editing() };
  if (r.keyAfterChromeClick.count !== countBeforeToolbarRetype + 1 || r.keyAfterChromeClick.kind !== "actor" || !r.keyAfterChromeClick.editing) {
    fail(`depois de clicar no título, a tecla 3 deveria criar um Actor em edição: ${JSON.stringify(r.keyAfterChromeClick)}`);
  }
  await page.keyboard.press("Escape");

  r.ink = await stickies().first().evaluate((node) => {
    const painted = node.style.getPropertyValue("--sticky-ink");
    const probe = document.createElement("span");
    probe.style.color = painted;
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    const text = node.querySelector(".sticky-text");
    const rendered = getComputedStyle(text).color;
    node.style.setProperty("--sticky-ink", "rgb(1, 2, 3)");
    const followsProperty = getComputedStyle(text).color === "rgb(1, 2, 3)";
    node.style.setProperty("--sticky-ink", painted);
    return { painted, expected, rendered, followsProperty };
  });
  if (!r.ink.painted || r.ink.rendered !== r.ink.expected || !r.ink.followsProperty) fail(`o texto do post-it deveria usar a tinta do domínio (--sticky-ink): ${JSON.stringify(r.ink)}`);

  const countBeforeRetype = await stickies().count();
  await stickies().nth(1).click();
  r.retype = [];
  for (const expected of KINDS) {
    await page.keyboard.press(expected.key);
    const changed = { ...(await describe(stickies().nth(1))), count: await stickies().count(), editing: await editing(), selected: await page.locator(".sticky.is-selected").count() };
    r.retype.push(changed.kind);
    if (changed.kind !== expected.kind || changed.label !== expected.label || changed.bg !== expected.bg || changed.count !== countBeforeRetype || changed.editing || changed.selected !== 1) {
      fail(`a tecla ${expected.key} no post-it selecionado deveria trocar o tipo para ${expected.label}, sem criar nem editar: ${JSON.stringify(changed)}`);
    }
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
