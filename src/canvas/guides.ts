// #14 Encaixe do arraste: guias de alinhamento com os cards parados e, longe delas, a grade de 24 px.
// A guia vence a grade em cada eixo: o "Organizar" gera posições fora da grade, e um card que volta
// para a sua linha precisa encaixar nos vizinhos, não alguns pixels ao lado.
import { GRID_STEP, type NodeKey, type Point } from "@telos/domain";
import { state } from "../core/state";
import { $ } from "../ui/dom";
import { pos } from "./layout";
import { sizeOf } from "./size";

const SNAP_SCREEN_PX = 6;
/** A guia passa um pouco das pontas dos cards alinhados. */
const GUIDE_OVERHANG = 14;

interface GuideLine {
  /** Coordenada da linha (x das guias verticais, y das horizontais). */
  at: number;
  /** Extensão do card que gerou a linha, no outro eixo. */
  from: number;
  to: number;
}

export interface GuideLines {
  vertical: GuideLine[];
  horizontal: GuideLine[];
}

interface AxisSnap {
  value: number;
  guide: number | null;
}

/** Bordas e centros dos cards visíveis que não estão sendo arrastados (calculado no início do arraste). */
export function collectGuideLines(moving: Iterable<NodeKey>): GuideLines {
  const skip = new Set(moving);
  const lines: GuideLines = { vertical: [], horizontal: [] };
  for (const k of state.visibleKeys) {
    if (skip.has(k)) continue;
    const p = pos(k);
    const s = sizeOf(k);
    for (const x of [p.x, p.x + s.w / 2, p.x + s.w]) lines.vertical.push({ at: x, from: p.y, to: p.y + s.h });
    for (const y of [p.y, p.y + s.h / 2, p.y + s.h]) lines.horizontal.push({ at: y, from: p.x, to: p.x + s.w });
  }
  return lines;
}

function snapAxis(start: number, length: number, lines: GuideLine[], threshold: number): AxisSnap {
  let best: AxisSnap | null = null;
  let bestDistance = Infinity;
  // Empate (cards da mesma altura: topo, meio e base à mesma distância): fica a borda de cima/esquerda.
  for (const offset of [0, length / 2, length]) {
    for (const line of lines) {
      const distance = Math.abs(start + offset - line.at);
      if (distance <= threshold && distance < bestDistance) {
        bestDistance = distance;
        best = { value: line.at - offset, guide: line.at };
      }
    }
  }
  return best ?? { value: Math.round(start / GRID_STEP) * GRID_STEP, guide: null };
}

/**
 * Posição final do card arrastado a partir da posição livre (`raw`). Com `free` (Alt), não encaixa.
 * Desenha as guias que encaixaram.
 */
export function snapDrag(key: NodeKey, raw: Point, lines: GuideLines, free: boolean): Point {
  if (free) {
    hideGuides();
    return { x: Math.round(raw.x), y: Math.round(raw.y) };
  }
  const size = sizeOf(key);
  const threshold = SNAP_SCREEN_PX / state.cam.z;
  const x = snapAxis(raw.x, size.w, lines.vertical, threshold);
  const y = snapAxis(raw.y, size.h, lines.horizontal, threshold);
  const at = { x: Math.round(x.value), y: Math.round(y.value) };
  drawGuides({ ...at, ...size }, x.guide, y.guide, lines);
  return at;
}

function spanOf(guide: number, lines: GuideLine[], from: number, to: number): [number, number] {
  let lo = from;
  let hi = to;
  for (const line of lines) {
    if (Math.abs(line.at - guide) > 0.5) continue;
    lo = Math.min(lo, line.from);
    hi = Math.max(hi, line.to);
  }
  return [lo - GUIDE_OVERHANG, hi + GUIDE_OVERHANG];
}

function drawGuides(
  rect: { x: number; y: number; w: number; h: number },
  guideX: number | null,
  guideY: number | null,
  lines: GuideLines,
): void {
  const parts: string[] = [];
  if (guideX !== null) {
    const [y1, y2] = spanOf(guideX, lines.vertical, rect.y, rect.y + rect.h);
    parts.push(`<line class="guide-line" x1="${guideX}" y1="${y1}" x2="${guideX}" y2="${y2}"/>`);
  }
  if (guideY !== null) {
    const [x1, x2] = spanOf(guideY, lines.horizontal, rect.x, rect.x + rect.w);
    parts.push(`<line class="guide-line" x1="${x1}" y1="${guideY}" x2="${x2}" y2="${guideY}"/>`);
  }
  $("#guideLayer").innerHTML = parts.join("");
}

export function hideGuides(): void {
  $("#guideLayer").innerHTML = "";
}
