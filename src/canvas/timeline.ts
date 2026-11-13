// #6 Timeline horizontal da jornada: o tempo corre da esquerda para a direita.
// Linhas (de cima para baixo): hotspots · jornada · capítulos · cenas · EVENTOS ·
// fluxo ES (caixas livres) · domínios · sistemas · telas · tabelas.
// #7 Com raias, a linha de EVENTOS vira uma faixa por ator (quem age na cena).
import { NARRATIVE_KINDS, NODE_H, NODE_W } from "../domain/constants";
import { keyKind, nodeKey } from "../domain/keys";
import { laneOf } from "../domain/lanes";
import type { Chapter, EventItem, NodeKey, NodeKind, Point, Positions, Scene } from "../domain/types";
import { related, state } from "../core/state";

export const TL = {
  X0: 120,
  /** Largura de uma coluna de evento. */
  COLW: NODE_W + 48,
  /** Respiro extra entre capítulos. */
  CHAPTER_GAP: 56,
  STACK: NODE_H + 34,
  ROW: { hotspot: 0, journey: 150, chapter: 300, scene: 450, event: 600 } as Record<string, number>,
  FLOW_Y: 760,
  /** Altura de uma raia (um evento + respiro). */
  LANE_H: NODE_H + 46,
  /** Deslocamento do card dentro da raia. */
  LANE_PAD: 22,
};

export interface LaneRow {
  id: string;
  label: string;
  top: number;
  height: number;
  count: number;
}

export const lanesOn = (): boolean => state.layoutMode === "timeline" && state.lanes;

function sceneOfEvent(k: NodeKey): Scene | undefined {
  const ev = state.ws.events.find((e) => nodeKey("event", e.id) === k) as EventItem | undefined;
  return state.ws.scenes.find((s) => s.id === ev?.sceneId);
}

/** Raias usadas no recorte (eventos visíveis), na ordem do catálogo. */
export function laneRows(keys: Set<NodeKey>): LaneRow[] {
  const ws = state.ws;
  const counts = new Map<string, number>();
  for (const k of keys) {
    if (keyKind(k) !== "event") continue;
    const lane = laneOf(ws, sceneOfEvent(k));
    counts.set(lane, (counts.get(lane) || 0) + 1);
  }
  return ws.lanes
    .filter((l) => counts.has(l.id))
    .map((l, i) => ({ id: l.id, label: l.label, top: TL.ROW.event + i * TL.LANE_H, height: TL.LANE_H, count: counts.get(l.id)! }));
}

/** y de um nó na timeline (eventos respeitam a raia quando ela está ligada). */
export function rowYFor(k: NodeKey, keys: Set<NodeKey>): number {
  const kind = keyKind(k);
  if (kind === "event" && lanesOn()) {
    const lane = laneOf(state.ws, sceneOfEvent(k));
    const row = laneRows(new Set([...keys, k])).find((r) => r.id === lane);
    if (row) return row.top + TL.LANE_PAD;
  }
  return TL.ROW[kind] ?? flowTop(keys);
}

/** Topo da linha do fluxo ES (abaixo da última raia, quando houver raias). */
function flowTop(keys: Set<NodeKey>): number {
  if (!lanesOn()) return TL.FLOW_Y;
  const rows = laneRows(keys);
  return rows.length ? rows[rows.length - 1].top + TL.LANE_H + 40 : TL.FLOW_Y;
}

const TECH_KINDS: NodeKind[] = ["domain", "system", "screen", "table"];

function neighbors(k: NodeKey): NodeKey[] {
  return related(k).map((e) => (e.from === k ? e.to : e.from));
}

function overlaps(positions: Positions, keys: Iterable<NodeKey>, p: Point, self: NodeKey): boolean {
  for (const k of keys) {
    if (k === self) continue;
    const q = positions[k];
    if (q && Math.abs(q.x - p.x) < NODE_W + 8 && Math.abs(q.y - p.y) < NODE_H + 8) return true;
  }
  return false;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Reposiciona todos os nós visíveis do recorte no formato de linha do tempo. */
export function timelineLayout(keys: Set<NodeKey>, positions: Positions): void {
  const ws = state.ws;
  const has = (k: NodeKey) => keys.has(k);
  for (const k of keys) delete positions[k];
  const placed = () => [...keys].filter((k) => positions[k]);
  const { COLW, ROW } = TL;
  const eventY = (k: NodeKey) => rowYFor(k, keys);
  const FLOW_Y = flowTop(keys);

  // 1) Narrativa: capítulos → cenas → eventos, em colunas sequenciais.
  const jIndex = (id: string) => ws.journeys.findIndex((j) => j.id === id);
  const chapters = ws.chapters
    .filter((c) => has(nodeKey("chapter", c.id)))
    .sort((a, b) => jIndex(a.journeyId) - jIndex(b.journeyId) || ws.chapters.indexOf(a) - ws.chapters.indexOf(b));
  let x = TL.X0;
  const placeScene = (sceneId: string) => {
    positions[nodeKey("scene", sceneId)] = { x, y: ROW.scene };
    const events = ws.events.filter((e) => e.sceneId === sceneId && has(nodeKey("event", e.id)));
    if (!events.length) x += COLW;
    for (const e of events) {
      const ek = nodeKey("event", e.id);
      positions[ek] = { x, y: eventY(ek) };
      x += COLW;
    }
  };
  for (const c of chapters) {
    const start = x;
    for (const s of ws.scenes) if (s.chapter === c.id && has(nodeKey("scene", s.id))) placeScene(s.id);
    if (x === start) x += COLW;
    positions[nodeKey("chapter", c.id)] = { x: start, y: ROW.chapter };
    x += TL.CHAPTER_GAP;
  }
  // Cenas cujo capítulo não está no recorte.
  for (const s of ws.scenes) if (has(nodeKey("scene", s.id)) && !positions[nodeKey("scene", s.id)]) placeScene(s.id);
  // Eventos soltos (cena fora do recorte).
  for (const e of ws.events) {
    const k = nodeKey("event", e.id);
    if (has(k) && !positions[k]) {
      positions[k] = { x, y: eventY(k) };
      x += COLW;
    }
  }
  for (const j of ws.journeys) {
    const k = nodeKey("journey", j.id);
    if (!has(k)) continue;
    const xs = chapters.filter((c) => c.journeyId === j.id).map((c) => positions[nodeKey("chapter", c.id)].x);
    positions[k] = { x: xs.length ? Math.min(...xs) : TL.X0, y: ROW.journey };
  }
  let endX = x;

  // 2) Fluxo ES (caixas livres): abaixo do evento a que se ligam; cadeias seguem para a direita.
  const semantic = [...keys].filter((k) => keyKind(k) === "semantic");
  const pending = new Set(semantic);
  const placeFlow = (k: NodeKey, p: Point) => {
    const spot = { ...p };
    while (overlaps(positions, placed(), spot, k)) spot.y += TL.STACK;
    positions[k] = spot;
    pending.delete(k);
  };
  const flowTarget = (k: NodeKey): Point | null => {
    const ns = neighbors(k).filter((n) => positions[n]);
    const anchors = ns.filter((n) => NARRATIVE_KINDS.includes(keyKind(n)));
    if (anchors.length) return { x: avg(anchors.map((n) => positions[n].x)), y: FLOW_Y };
    const flow = ns.find((n) => keyKind(n) === "semantic");
    return flow ? { x: positions[flow].x + COLW, y: positions[flow].y } : null;
  };
  let progress = true;
  while (pending.size && progress) {
    progress = false;
    for (const k of [...pending]) {
      const t = flowTarget(k);
      if (t) {
        placeFlow(k, t);
        progress = true;
      }
    }
    if (!progress && pending.size) {
      // Componente solto: começa no fim da linha do tempo.
      const first = [...pending][0];
      placeFlow(first, { x: endX, y: FLOW_Y });
      endX += COLW;
      progress = true;
    }
  }

  // 3) Hotspots: acima do card que questionam (empilham para cima).
  for (const k of [...keys].filter((k) => keyKind(k) === "hotspot")) {
    const ns = neighbors(k).filter((n) => positions[n]);
    const spot = { x: ns.length ? avg(ns.map((n) => positions[n].x)) : (endX += COLW) - COLW, y: ROW.hotspot };
    while (overlaps(positions, placed(), spot, k)) spot.y -= TL.STACK;
    positions[k] = spot;
  }

  // 4) Rastreabilidade técnica: uma linha por tipo, alinhada à média dos eventos ligados.
  const flowBottom = Math.max(FLOW_Y - TL.STACK, ...semantic.map((k) => positions[k]?.y ?? 0));
  let rowY = flowBottom + TL.STACK + 40;
  for (const t of TECH_KINDS) {
    const items = [...keys]
      .filter((k) => keyKind(k) === t)
      .map((k, i) => {
        const xs = neighbors(k)
          .filter((n) => positions[n] && (NARRATIVE_KINDS.includes(keyKind(n)) || keyKind(n) === "semantic"))
          .map((n) => positions[n].x);
        return { k, target: xs.length ? avg(xs) : TL.X0 + i * COLW };
      })
      .sort((a, b) => a.target - b.target);
    if (!items.length) continue;
    let next = TL.X0;
    for (const item of items) {
      const xx = Math.max(next, item.target);
      positions[item.k] = { x: Math.round(xx), y: rowY };
      next = xx + COLW;
    }
    rowY += TL.STACK + 12;
  }
}

/** Nó que surgiu no recorte sem posição: entra no fim da linha do seu tipo. */
export function timelineAppend(k: NodeKey, positions: Positions, keys: Set<NodeKey>): void {
  const kind = keyKind(k);
  const same = [...keys].filter((o) => o !== k && keyKind(o) === kind && positions[o]);
  const all = [...keys].filter((o) => positions[o]);
  const y = kind === "event" || !same.length ? rowYFor(k, keys) : positions[same[0]].y;
  const x = all.length ? Math.max(...all.map((o) => positions[o].x)) + TL.COLW : TL.X0;
  positions[k] = { x, y };
}

/** Insere uma coluna: empurra para a direita tudo que está a partir de `fromX`. */
export function makeRoom(positions: Positions, fromX: number, except: NodeKey): void {
  for (const [k, p] of Object.entries(positions)) if (k !== except && p.x >= fromX - 1) p.x += TL.COLW;
}

export interface LaneBand extends LaneRow {
  x: number;
  w: number;
}

/** Faixas horizontais das raias, cobrindo toda a largura ocupada no recorte. */
export function laneBands(keys: Set<NodeKey>, positions: Positions): LaneBand[] {
  if (!lanesOn()) return [];
  const xs = [...keys].map((k) => positions[k]?.x).filter((x): x is number => x !== undefined);
  if (!xs.length) return [];
  const x = Math.min(...xs) - 60;
  const w = Math.max(...xs) + NODE_W + 60 - x;
  return laneRows(keys).map((r) => ({ ...r, x, w }));
}

export interface ChapterBand {
  id: string;
  label: string;
  date: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Faixas de capítulo (fundo da timeline), calculadas das posições atuais. */
export function chapterBands(keys: Set<NodeKey>, positions: Positions): ChapterBand[] {
  const ws = state.ws;
  const bands: ChapterBand[] = [];
  ws.chapters.forEach((c: Chapter) => {
    const ck = nodeKey("chapter", c.id);
    if (!keys.has(ck) || !positions[ck]) return;
    const members = [ck];
    for (const s of ws.scenes.filter((s) => s.chapter === c.id)) {
      members.push(nodeKey("scene", s.id));
      for (const e of ws.events.filter((e) => e.sceneId === s.id)) members.push(nodeKey("event", e.id));
    }
    const ps = members.filter((k) => keys.has(k) && positions[k]).map((k) => positions[k]);
    const x0 = Math.min(...ps.map((p) => p.x)) - 22;
    const x1 = Math.max(...ps.map((p) => p.x)) + NODE_W + 22;
    const y0 = Math.min(...ps.map((p) => p.y)) - 46;
    const y1 = Math.max(...ps.map((p) => p.y)) + NODE_H + 24;
    const index = ws.chapters.filter((x) => x.journeyId === c.journeyId).indexOf(c) + 1;
    bands.push({
      id: c.id,
      label: `${String(index).padStart(2, "0")} · ${c.label}`,
      date: c.date || "",
      x: x0,
      y: y0,
      w: x1 - x0,
      h: y1 - y0,
    });
  });
  return bands;
}
