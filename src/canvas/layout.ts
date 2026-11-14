// Posições por recorte e layout automático em camadas.
import { COL, FREE_PLACED_KINDS, TYPES, keyId, keyKind, type NodeKey, type NodeKind, type Point, type Positions } from "@telos/domain";
import { persist } from "../core/persistence";
import { undoPush } from "../core/history";
import { state } from "../core/state";
import { notify } from "../ui/dom";
import { renderGraph } from "./render";
import { timelineAppend, timelineLayout } from "./timeline";
import { emotionBand } from "./emotion";
import { scopeKey, visible } from "./visibility";
import { sizeOf } from "./size";

export { sizeOf };

/** Chave das posições: recorte + modo (cada modo guarda seu próprio arranjo). */
export const positionsKey = (): string => (state.layoutMode === "timeline" ? (state.lanes ? "lanes|" : "timeline|") : "") + scopeKey();

export const isTimeline = (): boolean => state.layoutMode === "timeline";

export function activePositions(): Positions {
  const layouts = (state.ws.graph.layouts = state.ws.graph.layouts || {});
  const key = positionsKey();
  return layouts[key] || (layouts[key] = {});
}

export function pos(k: NodeKey): Point {
  return activePositions()[k] || { x: COL[keyKind(k)] || 200, y: 100 };
}

export function autoLayout(record = true): void {
  if (record) undoPush();
  if (isTimeline()) {
    timelineLayout(visible(), activePositions());
    persist();
    renderGraph();
    if (record) notify("Linha do tempo reorganizada");
    return;
  }
  layersLayout();
  persist();
  renderGraph();
  if (record) notify("Mapa reorganizado em oito camadas");
}

/** Layout clássico da v1.5: uma coluna por tipo, y pela ordem narrativa. */
function layersLayout(): void {
  const { ws } = state;
  const keys = visible();
  const positions = activePositions();
  const groups = Object.fromEntries(TYPES.map((t) => [t, [...keys].filter((k) => keyKind(k) === t)])) as Record<NodeKind, NodeKey[]>;
  const sceneIndex = (k: NodeKey) => ws.scenes.findIndex((s) => s.id === keyId(k));
  const orderScenes = groups.scene.sort((a, b) => sceneIndex(a) - sceneIndex(b));

  let y = 80;
  for (const k of orderScenes) {
    const scid = keyId(k);
    const es = groups.event.filter((e) => ws.events.find((x) => x.id === keyId(e))?.sceneId === scid);
    const h = Math.max(116, es.length * 116);
    positions[k] = { x: COL.scene, y: y + (h - 94) / 2 };
    es.forEach((e, i) => {
      positions[e] = { x: COL.event, y: y + i * 116 };
    });
    y += h + 26;
  }

  const avgY = (list: NodeKey[]) => list.reduce((n, x) => n + positions[x].y, 0) / list.length;
  const chapters = groups.chapter;
  chapters.forEach((k, i) => {
    const scs = orderScenes.filter((s) => ws.scenes.find((x) => x.id === keyId(s))?.chapter === keyId(k));
    positions[k] = { x: COL.chapter, y: scs.length ? avgY(scs) : 90 + i * 150 };
  });
  groups.journey.forEach((k, i) => {
    const cs = chapters.filter((c) => ws.chapters.find((x) => x.id === keyId(c))?.journeyId === keyId(k));
    positions[k] = { x: COL.journey, y: cs.length ? avgY(cs) : 95 + i * 165 };
  });

  for (const t of ["domain", "system", "screen", "table", "semantic", "hotspot"] as NodeKind[]) {
    const proposals = groups[t]
      .map((k, i) => {
        const linked = ws.graph.edges
          .filter((e) => e.from === k || e.to === k)
          .map((e) => (e.from === k ? e.to : e.from))
          .filter((x) => positions[x] && ["event", "scene", "chapter", "semantic"].includes(keyKind(x)));
        return { k, avg: linked.length ? avgY(linked) : 120 + i * 115 };
      })
      .sort((a, b) => a.avg - b.avg);
    let next = 75;
    for (const item of proposals) {
      const yy = Math.max(next, item.avg);
      positions[item.k] = { x: COL[t], y: yy };
      next = yy + 112;
    }
  }
}

/**
 * Nota ou moldura sem posição neste arranjo (ex.: criada na Timeline, aberta em Camadas):
 * reaproveita a posição de outro arranjo do mesmo recorte.
 */
function placeFreeNodes(keys: Set<NodeKey>, positions: Positions): void {
  const layouts = state.ws.graph.layouts || {};
  for (const k of keys) {
    if (!FREE_PLACED_KINDS.includes(keyKind(k)) || positions[k]) continue;
    const from = Object.values(layouts).find((lay) => lay[k]);
    if (from) positions[k] = { ...from[k] };
  }
}

/** Garante posição para todo nó visível (layout automático se o recorte for novo). */
export function ensurePositions(): void {
  const keys = visible();
  const positions = activePositions();
  const fresh = !Object.keys(positions).length;
  placeFreeNodes(keys, positions);
  if (fresh) {
    autoLayout(false);
    return;
  }
  if (isTimeline()) {
    for (const k of keys) if (!positions[k]) timelineAppend(k, positions, keys);
    return;
  }
  const lanes = {} as Record<NodeKind, number>;
  for (const t of TYPES) {
    const have = Object.keys(positions).filter((k) => keyKind(k) === t);
    lanes[t] = Math.max(60, ...have.map((k) => positions[k].y + 125));
  }
  for (const k of keys) {
    if (!positions[k]) {
      const t = keyKind(k);
      positions[k] = { x: COL[t], y: lanes[t] };
      lanes[t] += 130;
    }
  }
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  w: number;
  h: number;
}

export function calcBounds(): Bounds {
  const keys = [...state.visibleKeys];
  const positions = activePositions();
  const xs = keys.map((k) => positions[k]?.x ?? COL[keyKind(k)]);
  const ys = keys.map((k) => positions[k]?.y ?? 100);
  let minX = xs.length ? Math.min(...xs) : 0;
  let minY = ys.length ? Math.min(...ys) : 0;
  const maxX = xs.length ? Math.max(...keys.map((k, i) => xs[i] + sizeOf(k).w)) : 2000;
  const maxY = ys.length ? Math.max(...keys.map((k, i) => ys[i] + sizeOf(k).h)) : 800;
  // #8 A curva de emoção fica acima dos cards e entra no enquadramento/export.
  const emo = emotionBand(state.visibleKeys, positions);
  if (emo) {
    minY = Math.min(minY, emo.top);
    minX = Math.min(minX, emo.x);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

const GAP_Y = 30;

/**
 * Primeira posição livre a partir de `start`, andando para baixo (dir=1) ou para cima (dir=-1).
 * Molduras não contam como obstáculo: os cards ficam dentro delas.
 */
export function freeSpot(start: Point, ignore: NodeKey, dir: 1 | -1 = 1): Point {
  const positions = activePositions();
  const self = sizeOf(ignore);
  const keys = [...visible()].filter((k) => k !== ignore && keyKind(k) !== "frame");
  const collides = (p: Point) =>
    keys.some((k) => {
      const q = positions[k];
      if (!q) return false;
      const other = sizeOf(k);
      const overlapX = p.x < q.x + other.w - 10 && q.x < p.x + self.w - 10;
      const overlapY = p.y < q.y + other.h + 10 && q.y < p.y + self.h + 10;
      return overlapX && overlapY;
    });
  const p = { ...start };
  for (let i = 0; i < 40 && collides(p); i++) p.y += dir * (self.h + GAP_Y);
  return p;
}
