import { STICKY_KINDS, stickyStyle, type StickyKind } from "@telos/domain";
import { el } from "./dom";

function kindButton(kind: StickyKind, shortcut: number, onCreate: (kind: StickyKind) => void): HTMLButtonElement {
  const style = stickyStyle(kind);
  const swatch = el("span", { class: "toolbar-swatch", "aria-hidden": "true" });
  swatch.style.setProperty("--sticky-bg", style.bg);
  swatch.style.setProperty("--sticky-outline", style.outline);
  const button = el(
    "button",
    { type: "button", class: "toolbar-button", "aria-label": style.label, title: `${style.label} · ${style.hint} (${shortcut})` },
    swatch,
    el("span", { class: "toolbar-label" }, style.label),
  );
  button.addEventListener("click", () => onCreate(kind));
  return button;
}

export function renderToolbar(onCreate: (kind: StickyKind) => void): HTMLElement {
  return el(
    "nav",
    { class: "toolbar", "aria-label": "Post-its" },
    ...STICKY_KINDS.map((kind, index) => kindButton(kind, index + 1, onCreate)),
  );
}
