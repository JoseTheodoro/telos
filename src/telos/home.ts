import { el } from "./dom";
import { relativeTime } from "./relative-time";
import { go, routeHash } from "./router";
import type { BoardStore, BoardSummary } from "./store";

const UNTITLED = "Sem título";

function boardItem({ id, title, updatedAt }: BoardSummary): HTMLLIElement {
  return el(
    "li",
    {},
    el(
      "a",
      { class: "board-link", href: routeHash({ name: "canvas", id }) },
      el("span", { class: "board-title" }, title),
      el("time", { class: "board-date", datetime: updatedAt }, relativeTime(updatedAt)),
    ),
  );
}

function newBoardButton(store: BoardStore): HTMLButtonElement {
  const button = el("button", { type: "button", class: "button button-primary" }, "Novo canvas");
  button.addEventListener("click", () => go({ name: "canvas", id: store.create(UNTITLED).id }));
  return button;
}

function emptyInvite(store: BoardStore): HTMLElement {
  return el(
    "section",
    { class: "home-invite" },
    el("h2", { class: "home-invite-title" }, "Nenhum canvas ainda"),
    el("p", { class: "home-invite-text" }, "Crie um canvas para cada domínio que a sala vai explorar."),
    newBoardButton(store),
  );
}

export function renderHome(root: HTMLElement, store: BoardStore): void {
  const boards = store.list();
  const header = el("header", { class: "home-header" }, el("h1", { class: "brand" }, "Telos"));
  if (boards.length) header.append(newBoardButton(store));
  const content = boards.length ? el("ul", { class: "board-list", "aria-label": "Canvas" }, ...boards.map(boardItem)) : emptyInvite(store);
  document.title = "Telos";
  root.replaceChildren(el("main", { class: "home" }, header, content));
}
