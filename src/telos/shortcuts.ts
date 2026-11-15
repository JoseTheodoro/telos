import { STICKY_KINDS, type StickyKind } from "@telos/domain";

const hasModifier = (event: KeyboardEvent): boolean => event.ctrlKey || event.metaKey || event.altKey;

const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement);

export function shortcutOf(kind: StickyKind): string {
  return String(STICKY_KINDS.indexOf(kind) + 1);
}

export function kindShortcutOf(event: KeyboardEvent): StickyKind | null {
  if (hasModifier(event) || isTextField(event.target)) return null;
  return STICKY_KINDS.find((kind) => shortcutOf(kind) === event.key) ?? null;
}
