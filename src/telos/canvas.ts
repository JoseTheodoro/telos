import type { Board } from "@telos/domain";
import { el } from "./dom";
import { routeHash } from "./router";
import type { BoardStore } from "./store";
import { mountWall } from "./wall";

export function renderCanvas(root: HTMLElement, board: Board, store: BoardStore): void {
  const back = el(
    "a",
    { class: "icon-button", href: routeHash({ name: "home" }), "aria-label": "Voltar à home" },
    el("span", { "aria-hidden": "true" }, "←"),
  );
  const topbar = el("header", { class: "topbar" }, back, el("span", { class: "canvas-title" }, board.title));
  const wall = el("div", { class: "wall", role: "region", "aria-label": "Parede", tabindex: "0" });
  mountWall(wall, board, store);
  document.title = `${board.title} · Telos`;
  root.replaceChildren(el("div", { class: "canvas" }, wall, topbar));
  wall.focus();
}
