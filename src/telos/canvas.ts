import type { Board } from "@telos/domain";
import { el } from "./dom";
import { routeHash } from "./router";
import { isCanvasShortcut, kindForShortcut } from "./shortcuts";
import type { BoardStore } from "./store";
import { renderToolbar } from "./toolbar";
import { mountWall } from "./wall";

export function renderCanvas(root: HTMLElement, board: Board, store: BoardStore): void {
  const back = el(
    "a",
    { class: "icon-button", href: routeHash({ name: "home" }), "aria-label": "Voltar à home" },
    el("span", { "aria-hidden": "true" }, "←"),
  );
  const topbar = el("header", { class: "topbar" }, back, el("span", { class: "canvas-title" }, board.title));
  const wall = el("div", { class: "wall", role: "region", "aria-label": "Parede", tabindex: "0" });
  const { create, applyKindShortcut, clearSelection } = mountWall(wall, board, store);
  const canvas = el("div", { class: "canvas", tabindex: "-1" }, topbar, wall, renderToolbar(create));
  canvas.addEventListener("keydown", (event) => {
    if (!isCanvasShortcut(event)) return;
    const kind = kindForShortcut(event.key);
    if (event.key === "Escape") {
      clearSelection();
    } else if (kind) {
      event.preventDefault();
      applyKindShortcut(kind);
    }
  });
  document.title = `${board.title} · Telos`;
  root.replaceChildren(canvas);
  wall.focus();
}
