import { stickyStyle, type StickyKind } from "@telos/domain";

export function paintSticky(element: HTMLElement, kind: StickyKind): void {
  const style = stickyStyle(kind);
  element.style.setProperty("--sticky-bg", style.bg);
  element.style.setProperty("--sticky-outline", style.outline);
}
