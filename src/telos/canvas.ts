import type { Board } from "@telos/domain";
import { el } from "./dom";
import { routeHash } from "./router";

export function renderCanvas(root: HTMLElement, board: Board): void {
  const back = el(
    "a",
    { class: "icon-button", href: routeHash({ name: "home" }), "aria-label": "Voltar à home" },
    el("span", { "aria-hidden": "true" }, "←"),
  );
  const topbar = el("header", { class: "topbar" }, back, el("span", { class: "canvas-title" }, board.title));
  const wall = el("div", { class: "wall", role: "application", "aria-label": "Parede", tabindex: "0" });
  document.title = `${board.title} · Telos`;
  root.replaceChildren(el("div", { class: "canvas" }, wall, topbar));
  wall.focus();
}
