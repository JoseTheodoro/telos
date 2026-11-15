import {
  STICKY_INK,
  STICKY_KINDS,
  STICKY_SIZE,
  createSticky,
  stickyStyle,
  type Board,
  type Point,
  type Sticky,
  type StickyKind,
} from "@telos/domain";
import { el } from "./dom";
import type { BoardStore } from "./store";

interface StickyParts {
  sticky: Sticky;
  node: HTMLElement;
  text: HTMLElement;
}

export interface Wall {
  create(kind: StickyKind): void;
}

function kindForKey(key: string): StickyKind | null {
  return STICKY_KINDS[Number(key) - 1] ?? null;
}

function restyle(node: HTMLElement, kind: StickyKind): void {
  const style = stickyStyle(kind);
  node.dataset.kind = kind;
  node.setAttribute("aria-label", style.label);
  node.style.setProperty("--sticky-bg", style.bg);
  node.style.setProperty("--sticky-outline", style.outline);
  node.style.setProperty("--sticky-ink", STICKY_INK);
}

function renderSticky(sticky: Sticky): HTMLElement {
  const node = el(
    "div",
    { class: "sticky", role: "note", tabindex: "0", "data-id": sticky.id },
    el("div", { class: "sticky-text" }, sticky.text),
  );
  restyle(node, sticky.kind);
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
    restyle(parts.node, kind);
    save();
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
    if (event.target === wall)
      wall.classList.toggle("is-entered", !(event.relatedTarget instanceof Node && wall.contains(event.relatedTarget)));
    if (event.target instanceof HTMLElement && event.target.classList.contains("sticky")) select(event.target.dataset.id ?? null);
  });

  wall.addEventListener("focusout", () => wall.classList.remove("is-entered"));

  wall.addEventListener("dblclick", (event) => {
    const id = stickyIdAt(event.target);
    if (isEditing(id)) return;
    if (id) startEditing(id);
    else createAt("domainEvent", toWorld(event.clientX, event.clientY));
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
    const kind = kindForKey(event.key);
    if (event.key === "Escape") {
      select(null);
    } else if (event.key === "Enter" && selectedId) {
      event.preventDefault();
      startEditing(selectedId);
    } else if (kind && !hasModifier(event)) {
      event.preventDefault();
      if (selectedId) changeKind(selectedId, kind);
      else createAt(kind, pointer ?? wallCenter());
    }
  });

  board.stickies.forEach(mount);
  wall.append(world);
  return { create: (kind) => createAt(kind, pointer ?? wallCenter()) };
}
