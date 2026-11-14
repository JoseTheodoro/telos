import { STICKY_SIZE, createSticky, stickyStyle, type Board, type Sticky } from "@telos/domain";
import { el } from "./dom";
import type { BoardStore } from "./store";

interface Point {
  x: number;
  y: number;
}

const CREATE_KEY = "1";

function renderSticky(sticky: Sticky): HTMLElement {
  const style = stickyStyle(sticky.kind);
  const node = el(
    "div",
    { class: "sticky", role: "note", tabindex: "0", "aria-label": style.label, "data-id": sticky.id, "data-kind": sticky.kind },
    el("div", { class: "sticky-text" }, sticky.text),
  );
  node.style.setProperty("--sticky-bg", style.bg);
  node.style.setProperty("--sticky-outline", style.outline);
  node.style.left = `${sticky.x}px`;
  node.style.top = `${sticky.y}px`;
  node.style.width = `${sticky.w}px`;
  node.style.minHeight = `${STICKY_SIZE.h}px`;
  return node;
}

function placeCaretAtEnd(element: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

const hasModifier = (event: KeyboardEvent): boolean => event.ctrlKey || event.metaKey || event.altKey;

export function mountWall(wall: HTMLElement, board: Board, store: BoardStore): void {
  const world = el("div", { class: "world" });
  const nodes = new Map<string, HTMLElement>();
  let pointer: Point | null = null;
  let selectedId: string | null = null;
  let editingId: string | null = null;

  const save = (): void => store.save(board);
  const stickyOf = (id: string): Sticky | undefined => board.stickies.find((sticky) => sticky.id === id);
  const textOf = (id: string): HTMLElement | null | undefined => nodes.get(id)?.querySelector<HTMLElement>(".sticky-text");

  const toWorld = (clientX: number, clientY: number): Point => {
    const origin = world.getBoundingClientRect();
    return { x: clientX - origin.left, y: clientY - origin.top };
  };

  const wallCenter = (): Point => {
    const bounds = wall.getBoundingClientRect();
    return toWorld(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
  };

  const select = (id: string | null): void => {
    if (selectedId) nodes.get(selectedId)?.classList.remove("is-selected");
    selectedId = id;
    if (id) nodes.get(id)?.classList.add("is-selected");
  };

  const startEditing = (id: string): void => {
    const node = nodes.get(id);
    const text = textOf(id);
    if (!node || !text) return;
    select(id);
    editingId = id;
    node.classList.add("is-editing");
    text.contentEditable = "plaintext-only";
    text.focus();
    placeCaretAtEnd(text);
  };

  const stopEditing = (): void => {
    if (!editingId) return;
    const node = nodes.get(editingId);
    const text = textOf(editingId);
    editingId = null;
    node?.classList.remove("is-editing");
    text?.removeAttribute("contenteditable");
  };

  const syncText = (id: string): void => {
    const sticky = stickyOf(id);
    const node = nodes.get(id);
    const text = textOf(id);
    if (!sticky || !node || !text) return;
    sticky.text = text.innerText;
    sticky.h = Math.max(STICKY_SIZE.h, Math.round(node.getBoundingClientRect().height));
    save();
  };

  const mount = (sticky: Sticky): void => {
    const node = renderSticky(sticky);
    const text = node.querySelector<HTMLElement>(".sticky-text");
    text?.addEventListener("input", () => syncText(sticky.id));
    text?.addEventListener("blur", stopEditing);
    nodes.set(sticky.id, node);
    world.append(node);
  };

  const createAt = (center: Point): void => {
    const sticky = createSticky("domainEvent", {
      x: Math.round(center.x - STICKY_SIZE.w / 2),
      y: Math.round(center.y - STICKY_SIZE.h / 2),
    });
    board.stickies.push(sticky);
    mount(sticky);
    save();
    startEditing(sticky.id);
  };

  const stickyIdAt = (target: EventTarget | null): string | null =>
    target instanceof Element ? (target.closest<HTMLElement>(".sticky")?.dataset.id ?? null) : null;

  wall.addEventListener("pointermove", (event) => {
    pointer = toWorld(event.clientX, event.clientY);
  });
  wall.addEventListener("pointerleave", () => {
    pointer = null;
  });

  wall.addEventListener("pointerdown", (event) => {
    const id = stickyIdAt(event.target);
    if (id && id === editingId) return;
    select(id);
  });

  wall.addEventListener("dblclick", (event) => {
    const id = stickyIdAt(event.target);
    if (id) startEditing(id);
    else createAt(toWorld(event.clientX, event.clientY));
  });

  wall.addEventListener("keydown", (event) => {
    if (editingId) {
      if (event.key !== "Escape") return;
      const id = editingId;
      event.preventDefault();
      stopEditing();
      nodes.get(id)?.focus();
      return;
    }
    if (event.key === "Escape") {
      select(null);
    } else if (event.key === "Enter" && selectedId) {
      event.preventDefault();
      startEditing(selectedId);
    } else if (event.key === CREATE_KEY && !hasModifier(event)) {
      event.preventDefault();
      createAt(pointer ?? wallCenter());
    }
  });

  board.stickies.forEach(mount);
  wall.append(world);
}
