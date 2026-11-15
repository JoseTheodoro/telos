import type { StickyKind } from "./board.ts";

export const STICKY_INK = "#1d1f23";

export interface StickyStyle {
  label: string;
  hint: string;
  bg: string;
  outline: string;
}

const STICKY_STYLES: Record<StickyKind, StickyStyle> = {
  domainEvent: { label: "Domain Event", hint: "Fato relevante, sempre no passado", bg: "#ffe3c4", outline: "#f5b97a" },
  hotspot: { label: "Hotspot", hint: "Risco, conflito ou pergunta em aberto", bg: "#ffdedd", outline: "#f3a3a0" },
  actor: { label: "Actor", hint: "Quem age ou decide", bg: "#fff3a8", outline: "#e8d266" },
  externalSystem: { label: "External System", hint: "Sistema envolvido ou externo", bg: "#fde1ee", outline: "#f2a9c9" },
  aggregate: { label: "Aggregate", hint: "Quem guarda o estado e as invariantes", bg: "#fbf1d9", outline: "#e6cf95" },
};

export function stickyStyle(kind: StickyKind): StickyStyle {
  return STICKY_STYLES[kind];
}
