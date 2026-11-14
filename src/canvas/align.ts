// #14 Alinhar e distribuir a seleção múltipla (botões do inspetor em lote). Cada ação é um só undo.
import { type NodeKey, type Point } from "@pep-atlas/domain";
import { change } from "../core/history";
import { selectedNodeKeys, state } from "../core/state";
import { notify } from "../ui/dom";
import { frameCarriers } from "./frame";
import { activePositions, pos } from "./layout";
import { sizeOf } from "./size";

export type AlignEdge = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

export const MIN_TO_DISTRIBUTE = 3;

const ALIGN_LABEL: Record<AlignEdge, string> = {
  left: "à esquerda",
  center: "pelo centro",
  right: "à direita",
  top: "pelo topo",
  middle: "pelo meio",
  bottom: "pela base",
};

interface Box {
  key: NodeKey;
  x: number;
  y: number;
  w: number;
  h: number;
}

function selectedBoxes(): Box[] {
  return selectedNodeKeys()
    .filter((k) => state.visibleKeys.has(k))
    .map((key) => ({ key, ...pos(key), ...sizeOf(key) }));
}

function alignTargets(boxes: Box[], edge: AlignEdge): Map<NodeKey, Point> {
  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const top = Math.min(...boxes.map((b) => b.y));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  const targetOf = (b: Box): Point => {
    switch (edge) {
      case "left":
        return { x: left, y: b.y };
      case "center":
        return { x: (left + right - b.w) / 2, y: b.y };
      case "right":
        return { x: right - b.w, y: b.y };
      case "top":
        return { x: b.x, y: top };
      case "middle":
        return { x: b.x, y: (top + bottom - b.h) / 2 };
      case "bottom":
        return { x: b.x, y: bottom - b.h };
    }
  };
  return new Map(
    boxes.map((b) => {
      const target = targetOf(b);
      return [b.key, { x: Math.round(target.x), y: Math.round(target.y) }];
    }),
  );
}

/** Espaços iguais entre as bordas (funciona com tamanhos diferentes); o primeiro e o último ficam onde estão. */
function distributeTargets(boxes: Box[], axis: DistributeAxis): { targets: Map<NodeKey, Point>; gap: number } {
  const startOf = (b: Box): number => (axis === "horizontal" ? b.x : b.y);
  const lengthOf = (b: Box): number => (axis === "horizontal" ? b.w : b.h);
  const sorted = [...boxes].sort((a, b) => startOf(a) - startOf(b));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = startOf(last) + lengthOf(last) - startOf(first);
  const gap = (span - sorted.reduce((sum, b) => sum + lengthOf(b), 0)) / (sorted.length - 1);
  const targets = new Map<NodeKey, Point>();
  let cursor = startOf(first);
  for (const b of sorted) {
    const at = Math.round(cursor);
    targets.set(b.key, axis === "horizontal" ? { x: at, y: b.y } : { x: b.x, y: at });
    cursor += lengthOf(b) + gap;
  }
  return { targets, gap };
}

/** Move os cards para os alvos; cada moldura leva junto o conteúdo que não está na seleção. */
function moveTo(targets: Map<NodeKey, Point>): { moved: number; carried: number } {
  const deltas = new Map<NodeKey, Point>();
  for (const [k, target] of targets) {
    const now = pos(k);
    if (target.x !== now.x || target.y !== now.y) deltas.set(k, { x: target.x - now.x, y: target.y - now.y });
  }
  if (!deltas.size) return { moved: 0, carried: 0 };
  const carried = [...frameCarriers([...targets.keys()])].filter(([, frame]) => deltas.has(frame));
  change(() => {
    const positions = activePositions();
    for (const [k, delta] of deltas) {
      const now = pos(k);
      positions[k] = { x: now.x + delta.x, y: now.y + delta.y };
    }
    for (const [k, frame] of carried) {
      const delta = deltas.get(frame) as Point;
      const now = pos(k);
      positions[k] = { x: now.x + delta.x, y: now.y + delta.y };
    }
  });
  return { moved: deltas.size, carried: carried.length };
}

const elements = (n: number): string => `${n} ${n === 1 ? "elemento" : "elementos"}`;
const carriedNote = (n: number): string => (n ? ` (+${n} dentro de molduras)` : "");

export function alignSelection(edge: AlignEdge): void {
  const boxes = selectedBoxes();
  if (boxes.length < 2) return;
  const { moved, carried } = moveTo(alignTargets(boxes, edge));
  if (!moved) {
    notify(`Já estão alinhados ${ALIGN_LABEL[edge]}`);
    return;
  }
  notify(`Alinhados ${ALIGN_LABEL[edge]}: ${elements(moved)}${carriedNote(carried)} · Ctrl+Z desfaz`);
}

export function distributeSelection(axis: DistributeAxis): void {
  const boxes = selectedBoxes();
  if (boxes.length < MIN_TO_DISTRIBUTE) {
    notify(`Distribuir precisa de ${MIN_TO_DISTRIBUTE} ou mais elementos`);
    return;
  }
  const { targets, gap } = distributeTargets(boxes, axis);
  const { moved, carried } = moveTo(targets);
  if (!moved) {
    notify("Os espaços já estão iguais");
    return;
  }
  const overlap = gap < 0 ? " · não cabem no intervalo e ficaram sobrepostos" : "";
  notify(
    `Distribuídos na ${axis === "horizontal" ? "horizontal" : "vertical"}: ${elements(moved)}${carriedNote(carried)}${overlap} · Ctrl+Z desfaz`,
  );
}
