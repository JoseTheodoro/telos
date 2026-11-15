import {
  DEFAULT_STICKY_KIND,
  STICKY_SIZE,
  createSticky,
  stickyStyle,
  type Board,
  type Point,
  type Sticky,
  type StickyKind,
} from "@telos/domain";
import { el } from "./dom";
import { paintSticky } from "./sticky-paint";
import type { BoardStore } from "./store";

interface StickyParts {
  sticky: Sticky;
  node: HTMLElement;
  text: HTMLElement;
}

export interface Wall {
  create(kind: StickyKind): void;
  applyKindShortcut(kind: StickyKind): void;
}

function applyKind(node: HTMLElement, kind: StickyKind): void {
  node.dataset.kind = kind;
  node.setAttribute("aria-label", stickyStyle(kind).label);
  paintSticky(node, kind);
}

function renderSticky(sticky: Sticky): HTMLElement {
  const node = el(
    "div",
    { class: "sticky", role: "note", tabindex: "0", "data-id": sticky.id },
    el("div", { class: "sticky-text" }, sticky.text),
  );
  applyKind(node, sticky.kind);
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

const isInsideText = (target: EventTarget | null): boolean => target instanceof Element && target.closest(".sticky-text") !== null;

export function mountWall(wall: HTMLElement, board: Board, store: BoardStore): Wall {
  const world = el("div", { class: "world" });
  const nodes = new Map<string, HTMLElement>();
  let pointer: Point | null = null;
  let selectedId: string | null = null;
  let editingId: string | null = null;

  const save = (): void => store.save(board);
  const isEditing = (id: string | null): boolean => id !== null && id === editingId;

  const partsOf = (id: string): StickyParts | null => {
    const sticky = board.stickies.find((candidate) => candidate.id === id);
    const node = nodes.get(id);
    const text = node?.querySelector<HTMLElement>(".sticky-text");
    return sticky && node && text ? { sticky, node, text } : null;
  };

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
    const parts = partsOf(id);
    if (!parts) return;
    select(id);
    editingId = id;
    parts.node.classList.add("is-editing");
    parts.text.contentEditable = "plaintext-only";
    parts.text.focus();
    placeCaretAtEnd(parts.text);
  };

  const stopEditing = (): void => {
    const parts = editingId ? partsOf(editingId) : null;
    editingId = null;
    parts?.node.classList.remove("is-editing");
    parts?.text.removeAttribute("contenteditable");
  };

  const syncText = (id: string): void => {
    const parts = partsOf(id);
    if (!parts) return;
    parts.sticky.text = parts.text.innerText;
    parts.sticky.h = Math.max(STICKY_SIZE.h, parts.node.offsetHeight);
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

  const createAt = (kind: StickyKind, center: Point): void => {
    const sticky = createSticky(kind, {
      x: Math.round(center.x - STICKY_SIZE.w / 2),
      y: Math.round(center.y - STICKY_SIZE.h / 2),
    });
    board.stickies.push(sticky);
    mount(sticky);
    save();
    startEditing(sticky.id);
  };

  const changeKind = (id: string, kind: StickyKind): void => {
    const parts = partsOf(id);
    if (!parts || parts.sticky.kind === kind) return;
    parts.sticky.kind = kind;
    applyKind(parts.node, kind);
    save();
  };

  const createHere = (kind: StickyKind): void => createAt(kind, pointer ?? wallCenter());

  const applyKindShortcut = (kind: StickyKind): void => {
    if (editingId) return;
    if (selectedId) changeKind(selectedId, kind);
    else createHere(kind);
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
    if (isEditing(id)) {
      if (!isInsideText(event.target)) event.preventDefault();
      return;
    }
    select(id);
  });

  wall.addEventListener("focusin", (event) => {
    if (event.target instanceof HTMLElement && event.target.classList.contains("sticky")) select(event.target.dataset.id ?? null);
  });

  wall.addEventListener("dblclick", (event) => {
    const id = stickyIdAt(event.target);
    if (isEditing(id)) return;
    if (id) startEditing(id);
    else createAt(DEFAULT_STICKY_KIND, toWorld(event.clientX, event.clientY));
  });

  wall.addEventListener("keydown", (event) => {
    if (editingId) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      wall.focus();
      stopEditing();
      select(null);
      return;
    }
    if (event.key === "Escape") {
      select(null);
    } else if (event.key === "Enter" && selectedId) {
      event.preventDefault();
      startEditing(selectedId);
    }
  });

  board.stickies.forEach(mount);
  wall.append(world);
  return { create: createHere, applyKindShortcut };
}
