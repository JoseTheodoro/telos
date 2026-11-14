import type { StickyKind } from "./board.ts";
import { ES_STYLES, type EsCategory } from "./es.ts";

export interface StickyStyle {
  label: string;
  bg: string;
  accent: string;
  outline: string;
}

const STICKY_CATEGORY: Record<StickyKind, { category: EsCategory; label: string }> = {
  domainEvent: { category: "evento", label: "Domain Event" },
};

export function stickyStyle(kind: StickyKind): StickyStyle {
  const { category, label } = STICKY_CATEGORY[kind];
  const style = ES_STYLES.find(({ id }) => id === category);
  if (!style) throw new Error(`Sem estilo para a categoria ${category}`);
  return { label, bg: style.bg, accent: style.accent, outline: style.outline };
}
