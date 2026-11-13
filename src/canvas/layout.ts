// Posições por recorte e layout automático em camadas.
import { COL, NODE_H, NODE_W, TYPES } from "../domain/constants";
import { keyId, keyKind } from "../domain/keys";
import type { NodeKey, NodeKind, Point, Positions } from "../domain/types";
import { persist } from "../core/persistence";
import { undoPush } from "../core/history";
import { state } from "../core/state";
import { notify } from "../ui/dom";
import { renderGraph } from "./render";
import { scopeKey, visible } from "./visibility";

export function activePositions(): Positions {
  const layouts = (state.ws.graph.layouts = state.ws.graph.layouts || {});
  const key = scopeKey();
  return layouts[key] || (layouts[key] = {});
}

export function pos(k: NodeKey): Point {
  return activePositions()[k] || { x: COL[keyKind(k)] || 200, y: 100 };
}

export function autoLayout(record = true): void {
  if (record) undoPush();
  const { ws } = state;
  const keys = visible();
  const positions = activePositions();
  const groups = Object.fromEntries(TYPES.map((t) => [t, [...keys].filter((k) => keyKind(k) === t)])) as Record<
    NodeKind,
    NodeKey[]
  >;
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

  for (const t of ["domain", "system", "screen", "table", "semantic"] as NodeKind[]) {
    const proposals = groups[t]
      .map((k, i) => {
        const linked = ws.graph.edges
          .filter((e) => e.from === k || e.to === k)
          .map((e) => (e.from === k ? e.to : e.from))
          .filter((x) => positions[x] && ["event", "scene", "chapter"].includes(keyKind(x)));
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
  persist();
  renderGraph();
  if (record) notify("Mapa reorganizado em oito camadas");
}

/** Garante posição para todo nó visível (layout automático se o recorte for novo). */
export function ensurePositions(): void {
  const keys = visible();
  const positions = activePositions();
  if (!Object.keys(positions).length) {
    autoLayout(false);
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
  const minX = xs.length ? Math.min(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxX = xs.length ? Math.max(...xs) + NODE_W : 2000;
  const maxY = ys.length ? Math.max(...ys) + NODE_H : 800;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}
