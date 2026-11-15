import { STICKY_INK, stickyStyle, type StickyKind } from "@telos/domain";

export function paintSticky(element: HTMLElement, kind: StickyKind): void {
  const style = stickyStyle(kind);
  element.style.setProperty("--sticky-bg", style.bg);
  element.style.setProperty("--sticky-outline", style.outline);
  element.style.setProperty("--sticky-ink", STICKY_INK);
}
