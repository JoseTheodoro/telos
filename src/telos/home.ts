import { el } from "./dom";
import { importBoardFile } from "./import-board";
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

interface ProblemsRegion {
  region: HTMLElement;
  show(messages: string[]): void;
  clear(): void;
}

function importButton(store: BoardStore, problems: ProblemsRegion): HTMLElement {
  const input = el("input", { type: "file", accept: ".json,application/json", hidden: "" });
  const button = el("button", { type: "button", class: "button" }, "Importar");
  button.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    problems.clear();
    const result = await importBoardFile(file, store);
    if (result.ok) go({ name: "canvas", id: result.board.id });
    else problems.show(result.messages);
  });
  return el("span", { class: "home-import" }, button, input);
}

function problemsRegion(): ProblemsRegion {
  const region = el("div", { class: "home-problems", role: "alert" });
  return {
    region,
    show: (messages) =>
      region.replaceChildren(
        el("p", { class: "home-problems-title" }, "Não foi possível importar."),
        el("ul", { class: "home-problems-list" }, ...messages.map((message) => el("li", {}, message))),
      ),
    clear: () => region.replaceChildren(),
  };
}

function emptyInvite(...actions: HTMLElement[]): HTMLElement {
  return el(
    "section",
    { class: "home-invite" },
    el("h2", { class: "home-invite-title" }, "Nenhum canvas ainda"),
    el("p", { class: "home-invite-text" }, "Crie um canvas para cada domínio que a sala vai explorar."),
    el("div", { class: "home-actions" }, ...actions),
  );
}

export function renderHome(root: HTMLElement, store: BoardStore): void {
  const boards = store.list();
  const problems = problemsRegion();
  const actions = [importButton(store, problems), newBoardButton(store)];
  const header = el("header", { class: "home-header" }, el("h1", { class: "brand" }, "Telos"));
  if (boards.length) header.append(el("div", { class: "home-actions" }, ...actions));
  const content = boards.length
    ? el("ul", { class: "board-list", "aria-label": "Canvas" }, ...boards.map(boardItem))
    : emptyInvite(...actions);
  document.title = "Telos";
  root.replaceChildren(el("main", { class: "home" }, header, problems.region, content));
}
