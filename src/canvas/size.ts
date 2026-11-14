// Tamanho dos cards no mundo: notas e molduras são redimensionáveis; os demais têm tamanho fixo.
import { FRAME_MIN, NODE_H, NODE_W, keyKind, type NodeKey } from "@telos/domain";
import { getByKey } from "../core/state";

const NOTE_DEFAULT = { w: 320, h: 180 };
const NOTE_MIN = { w: 180, h: 90 };
const FRAME_DEFAULT = { w: 560, h: 360 };

export function sizeOf(k: NodeKey): { w: number; h: number } {
  const kind = keyKind(k);
  if (kind !== "note" && kind !== "frame") return { w: NODE_W, h: NODE_H };
  const o = getByKey(k);
  const fallback = kind === "note" ? NOTE_DEFAULT : FRAME_DEFAULT;
  return { w: Number(o?.w) || fallback.w, h: Number(o?.h) || fallback.h };
}

/** Menor tamanho aceito pela alça de redimensionar. */
export function minSizeOf(k: NodeKey): { w: number; h: number } {
  return keyKind(k) === "frame" ? FRAME_MIN : NOTE_MIN;
}
