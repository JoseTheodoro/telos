import { STICKY_KINDS, type StickyKind } from "@telos/domain";

const hasModifier = (event: KeyboardEvent): boolean => event.ctrlKey || event.metaKey || event.altKey;

const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement);

export const isCanvasShortcut = (event: KeyboardEvent): boolean => !hasModifier(event) && !isTextField(event.target);

export function shortcutOf(kind: StickyKind): string {
  return String(STICKY_KINDS.indexOf(kind) + 1);
}

export function kindForShortcut(key: string): StickyKind | null {
  return STICKY_KINDS.find((kind) => shortcutOf(kind) === key) ?? null;
}
