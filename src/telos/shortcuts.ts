import { STICKY_KINDS, type StickyKind } from "@telos/domain";

export function kindForKey(key: string): StickyKind | null {
  return STICKY_KINDS.find((kind) => shortcutOf(kind) === key) ?? null;
}

export function shortcutOf(kind: StickyKind): string {
  return String(STICKY_KINDS.indexOf(kind) + 1);
}
