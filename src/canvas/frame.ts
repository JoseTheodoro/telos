// #11 Moldura: delimita uma área do canvas ("Bounded context Assistencial", "Fluxo de triagem").
// É pega pela faixa do título; o fundo deixa passar o mouse (pan, laço e duplo clique continuam funcionando).
import {
  FRAME_PALETTE,
  buildEntity,
  DEFAULT_NAME,
  newEntityId,
  keyKind,
  nodeKey,
  type FrameItem,
  type NodeKey,
  type Point,
} from "@telos/domain";
import { change } from "../core/history";
import { selectedNodeKeys, state } from "../core/state";
import { $, notify } from "../ui/dom";
import { localPoint } from "./camera";
import { startInlineEdit } from "./inline-edit";
import { activePositions, pos } from "./layout";
import { lastPointer } from "./note";
import { sizeOf } from "./size";
import { scopeKey } from "./visibility";

const FRAME_PAD = 40;
/** Espaço extra no topo para a faixa do título não cobrir os cards. */
const FRAME_HEAD = 44;
const FRAME_DEFAULT = { w: 560, h: 360 };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cards visíveis inteiramente dentro da moldura (molduras menores dentro dela também). */
export function containedKeys(frameKey: NodeKey): NodeKey[] {
  const f = pos(frameKey);
  const fs = sizeOf(frameKey);
  return [...state.visibleKeys].filter((k) => {
    if (k === frameKey) return false;
    const p = pos(k);
    const s = sizeOf(k);
    return p.x >= f.x && p.y >= f.y && p.x + s.w <= f.x + fs.w && p.y + s.h <= f.y + fs.h;
  });
}

/**
 * Cards dentro das molduras de `keys` que não estão em `keys`, cada um ligado à moldura mais interna
 * que o contém: é ela que o leva junto quando se move.
 */
export function frameCarriers(keys: NodeKey[]): Map<NodeKey, NodeKey> {
  const chosen = new Set(keys);
  const area = (k: NodeKey): number => sizeOf(k).w * sizeOf(k).h;
  const frames = keys.filter((k) => keyKind(k) === "frame").sort((a, b) => area(a) - area(b));
  const carrier = new Map<NodeKey, NodeKey>();
  for (const frame of frames) for (const k of containedKeys(frame)) if (!chosen.has(k) && !carrier.has(k)) carrier.set(k, frame);
  return carrier;
}

/** `keys` mais o conteúdo das molduras entre eles (a moldura sempre leva o que está dentro). */
export function withFrameContents(keys: NodeKey[]): NodeKey[] {
  return [...keys, ...frameCarriers(keys).keys()];
}

function rectAround(keys: NodeKey[]): Rect {
  const lefts = keys.map((k) => pos(k).x);
  const tops = keys.map((k) => pos(k).y);
  const rights = keys.map((k) => pos(k).x + sizeOf(k).w);
  const bottoms = keys.map((k) => pos(k).y + sizeOf(k).h);
  const x = Math.min(...lefts) - FRAME_PAD;
  const y = Math.min(...tops) - FRAME_PAD - FRAME_HEAD;
  return { x, y, w: Math.max(...rights) + FRAME_PAD - x, h: Math.max(...bottoms) + FRAME_PAD - y };
}

function rectAt(atCursor: boolean): Rect {
  const cursor = atCursor ? lastPointer() : null;
  if (cursor) return { x: cursor.x, y: cursor.y, ...FRAME_DEFAULT };
  const r = $("#stage").getBoundingClientRect();
  const center: Point = localPoint({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
  return { x: center.x - FRAME_DEFAULT.w / 2, y: center.y - FRAME_DEFAULT.h / 2, ...FRAME_DEFAULT };
}

/**
 * Cria uma moldura. Com cards selecionados, envolve todos; sem seleção, nasce no cursor
 * (atalho F) ou no centro da tela (botão). Abre já com o título em edição.
 */
export function addFrame(atCursor = false): void {
  const ws = state.ws;
  const wrapped = selectedNodeKeys().filter((k) => state.visibleKeys.has(k));
  const rect = wrapped.length ? rectAround(wrapped) : rectAt(atCursor);
  const id = newEntityId(ws, "frame");
  const k = nodeKey("frame", id);
  const scope = scopeKey();
  const color = FRAME_PALETTE[ws.frames.length % FRAME_PALETTE.length][1];
  const values: Record<string, string> = { color, scope, w: String(Math.round(rect.w)), h: String(Math.round(rect.h)) };
  const frame = buildEntity("frame", id, DEFAULT_NAME.frame, "Moldura", (f) => values[f] ?? "") as FrameItem;
  change(() => {
    ws.frames.push(frame);
    activePositions()[k] = { x: Math.round(rect.x), y: Math.round(rect.y) };
    state.selected = { kind: "node", id: k };
  });
  startInlineEdit(k, { isNew: true });
  if (wrapped.length) notify(`Moldura em volta de ${wrapped.length} ${wrapped.length === 1 ? "card" : "cards"}: dê um título`);
}
