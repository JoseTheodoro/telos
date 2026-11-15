import type { StickyKind } from "./board.ts";
import { ES_STYLES, type EsCategory } from "./es.ts";

export const STICKY_INK = "#1d1f23";

export interface StickyStyle {
  label: string;
  hint: string;
  bg: string;
  outline: string;
}

const STICKY_CATEGORY: Record<StickyKind, { category: EsCategory; label: string }> = {
  domainEvent: { category: "evento", label: "Domain Event" },
  hotspot: { category: "hotspot", label: "Hotspot" },
  actor: { category: "ator", label: "Actor" },
  externalSystem: { category: "externo", label: "External System" },
  aggregate: { category: "agregado", label: "Aggregate" },
};

export function stickyStyle(kind: StickyKind): StickyStyle {
  const { category, label } = STICKY_CATEGORY[kind];
  const style = ES_STYLES.find(({ id }) => id === category);
  if (!style) throw new Error(`Sem estilo para a categoria ${category}`);
  return { label, hint: style.hint, bg: style.bg, outline: style.outline };
}
