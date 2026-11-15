import { STICKY_KINDS, stickyStyle, type StickyKind } from "@telos/domain";
import { el } from "./dom";
import { shortcutOf } from "./shortcuts";
import { paintSticky } from "./sticky-paint";

const FOCUS_MOVES: Partial<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

function kindButton(kind: StickyKind, isTabStop: boolean, onCreate: (kind: StickyKind) => void): HTMLButtonElement {
  const { label, hint } = stickyStyle(kind);
  const shortcut = shortcutOf(kind);
  const swatch = el("span", { class: "toolbar-swatch", "aria-hidden": "true" });
  paintSticky(swatch, kind);
  const button = el(
    "button",
    {
      type: "button",
      class: "toolbar-button",
      tabindex: isTabStop ? "0" : "-1",
      "aria-keyshortcuts": shortcut,
      title: `${label} · ${hint} (${shortcut})`,
    },
    swatch,
    label,
  );
  button.addEventListener("click", () => onCreate(kind));
  return button;
}

export function renderToolbar(onCreate: (kind: StickyKind) => void): HTMLElement {
  const buttons = STICKY_KINDS.map((kind, index) => kindButton(kind, index === 0, onCreate));
  const toolbar = el("div", { class: "toolbar", role: "toolbar", "aria-label": "Post-its" }, ...buttons);
  const makeTabStop = (target: HTMLButtonElement): void =>
    buttons.forEach((button) => button.setAttribute("tabindex", button === target ? "0" : "-1"));

  toolbar.addEventListener("focusin", (event) => {
    const focused = buttons.find((button) => button === event.target);
    if (focused) makeTabStop(focused);
  });
  toolbar.addEventListener("keydown", (event) => {
    const move = FOCUS_MOVES[event.key];
    const current = buttons.findIndex((button) => button === document.activeElement);
    const next = move && current >= 0 ? buttons[move(current, buttons.length)] : undefined;
    if (!next) return;
    event.preventDefault();
    next.focus();
  });
  return toolbar;
}
