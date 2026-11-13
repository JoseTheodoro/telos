// #8 Curva de emoção acima da timeline (como num journey map): um ponto por cena,
// alinhado à coluna da cena; arrastar o ponto para cima/baixo muda a nota.
// A geometria fica aqui sem depender de layout.ts (calcBounds usa esta faixa).
import { NODE_W } from "../domain/constants";
import { EMOTION_MAX, emotionLevel, emotionSigned, hasEmotion } from "../domain/emotion";
import { keyId, keyKind, nodeKey } from "../domain/keys";
import type { NodeKey, Positions, Scene } from "../domain/types";
import { state } from "../core/state";
import { esc } from "../ui/dom";

export const EMO = {
  /** Distância vertical entre dois níveis da curva. */
  STEP: 44,
  /** Espaço do título no topo da faixa. */
  HEAD: 66,
  /** Linha das dores (abaixo do nível −2). */
  PAIN_GAP: 38,
  PAIN_H: 32,
  BOTTOM: 16,
  /** Respiro entre a faixa e o primeiro card. */
  GAP: 48,
  DOT_R: 19,
};

/** Altura total da faixa. */
export const EMO_H = EMO.HEAD + 4 * EMO.STEP + EMO.PAIN_GAP + EMO.PAIN_H + EMO.BOTTOM;

export interface EmotionPoint {
  sceneId: string;
  x: number;
  y: number;
  value: number | null;
  pain: string;
}

export interface EmotionBand {
  x: number;
  top: number;
  w: number;
  height: number;
  /** y do nível neutro (0). */
  zeroY: number;
  points: EmotionPoint[];
  rated: number;
}

export const emotionOn = (): boolean => state.layoutMode === "timeline" && state.emotion;

/** y de um nível dentro da faixa. */
export const levelY = (top: number, v: number): number => top + EMO.HEAD + (EMOTION_MAX - v) * EMO.STEP;

/** Faixa da curva para o recorte (null fora da timeline ou sem cenas visíveis). */
export function emotionBand(keys: Set<NodeKey>, positions: Positions): EmotionBand | null {
  if (!emotionOn()) return null;
  const scenes = state.ws.scenes.filter((s) => keys.has(nodeKey("scene", s.id)) && positions[nodeKey("scene", s.id)]);
  if (!scenes.length) return null;
  const placed = [...keys].map((k) => positions[k]).filter(Boolean);
  const minX = Math.min(...placed.map((p) => p.x));
  const maxX = Math.max(...placed.map((p) => p.x));
  const minY = Math.min(...placed.map((p) => p.y));
  const top = minY - EMO.GAP - EMO_H;
  const points = scenes
    .map((s: Scene): EmotionPoint => {
      const p = positions[nodeKey("scene", s.id)];
      const value = hasEmotion(s) ? s.emotion : null;
      return { sceneId: s.id, x: p.x + NODE_W / 2, y: levelY(top, value ?? 0), value, pain: (s.pain || "").trim() };
    })
    .sort((a, b) => a.x - b.x);
  return {
    x: minX - 60,
    top,
    w: maxX + NODE_W + 60 - (minX - 60),
    height: EMO_H,
    zeroY: levelY(top, 0),
    points,
    rated: points.filter((p) => p.value !== null).length,
  };
}

/** Curva suave (tangentes horizontais em cada ponto: picos e vales ficam nítidos). */
function curvePath(pts: EmotionPoint[]): string {
  return pts
    .map((p, i) => {
      if (!i) return `M ${p.x} ${p.y}`;
      const a = pts[i - 1];
      const mx = (a.x + p.x) / 2;
      return `C ${mx} ${a.y}, ${mx} ${p.y}, ${p.x} ${p.y}`;
    })
    .join(" ");
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

const dotColors = (v: number | null) =>
  v === null
    ? { fill: "#ffffff", stroke: "#b7c4bc" }
    : v > 0
      ? { fill: "#e3f4e8", stroke: "#3d956b" }
      : v < 0
        ? { fill: "#fde8e5", stroke: "#c2493d" }
        : { fill: "#f1f3f1", stroke: "#8a9a90" };

/**
 * Conteúdo SVG da faixa em coordenadas do mundo (usado no canvas e no export SVG).
 * `interactive`: marca pontos e dores para clique/arraste.
 */
export function emotionSvg(b: EmotionBand, interactive: boolean, selectedScene = ""): string {
  const { x, top, w, zeroY } = b;
  const rated = b.points.filter((p) => p.value !== null);
  const dataAttr = (id: string) => (interactive ? ` data-emo-scene="${esc(id)}"` : "");
  let out = `<rect x="${x}" y="${top}" width="${w}" height="${b.height}" rx="18" fill="#fffdf8" stroke="#eadfcb"/>`;
  out += `<text x="${x + 18}" y="${top + 30}" font-size="16" font-weight="800" fill="#8a5a1f">Curva de emoção</text>`;
  out += `<text x="${x + 190}" y="${top + 30}" font-size="12.5" fill="#a08a6a">${
    b.rated
      ? `${b.rated} de ${b.points.length} cena${b.points.length === 1 ? "" : "s"} com nota · arraste os pontos para ajustar`
      : "Arraste os pontos para cima ou para baixo: como a pessoa se sente em cada cena?"
  }</text>`;
  // Linhas-guia dos níveis (0 mais forte).
  for (let v = 2; v >= -2; v--) {
    const y = levelY(top, v);
    out += `<line x1="${x + 12}" x2="${x + w - 12}" y1="${y}" y2="${y}" stroke="${v === 0 ? "#d9cdb8" : "#f0e8da"}" stroke-width="${v === 0 ? 1.4 : 1}"${v === 0 ? "" : ' stroke-dasharray="4 6"'}/>`;
  }
  // Área acima (verde) e abaixo (vermelho) do neutro.
  if (rated.length > 1) {
    const d = curvePath(rated);
    const area = `${d} L ${rated[rated.length - 1].x} ${zeroY} L ${rated[0].x} ${zeroY} Z`;
    out += `<clipPath id="emo-up"><rect x="${x}" y="${top}" width="${w}" height="${zeroY - top}"/></clipPath>`;
    out += `<clipPath id="emo-down"><rect x="${x}" y="${zeroY}" width="${w}" height="${top + b.height - zeroY}"/></clipPath>`;
    out += `<path d="${area}" fill="#3d956b" fill-opacity=".13" clip-path="url(#emo-up)"/>`;
    out += `<path d="${area}" fill="#c2493d" fill-opacity=".12" clip-path="url(#emo-down)"/>`;
    out += `<path d="${d}" fill="none" stroke="#7a6248" stroke-width="3" stroke-linecap="round"/>`;
  }
  const painY = levelY(top, -2) + EMO.PAIN_GAP;
  for (const p of b.points) {
    const c = dotColors(p.value);
    const sel = p.sceneId === selectedScene;
    const lvl = p.value === null ? null : emotionLevel(p.value);
    const tip = lvl ? `${lvl.label} (${emotionSigned(lvl.value)})` : "Sem nota — arraste para cima ou para baixo";
    if (p.pain) {
      // Dor: chip vermelho na linha de baixo, ligado ao ponto por um tracejado.
      const cw = Math.min(NODE_W + 10, 36 + Math.min(p.pain.length, 28) * 7.6);
      out += `<line x1="${p.x}" x2="${p.x}" y1="${p.y + EMO.DOT_R}" y2="${painY}" stroke="#d98a80" stroke-width="1.2" stroke-dasharray="3 4"/>`;
      out += `<g class="emo-pain"${dataAttr(p.sceneId)}><title>Dor: ${esc(p.pain)}</title><rect x="${p.x - cw / 2}" y="${painY}" width="${cw}" height="${EMO.PAIN_H}" rx="8" fill="#fdecea" stroke="#e3a59d"/><text x="${p.x}" y="${painY + 20.5}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#a83d35">⚡ ${esc(truncate(p.pain, 28))}</text></g>`;
    }
    out += `<g class="emo-dot${p.value === null ? " unrated" : ""}${sel ? " selected" : ""}"${dataAttr(p.sceneId)}><title>${esc(tip)}</title>`;
    if (sel) out += `<circle cx="${p.x}" cy="${p.y}" r="${EMO.DOT_R + 6}" fill="none" stroke="#34815a" stroke-opacity=".35" stroke-width="5"/>`;
    out += `<circle cx="${p.x}" cy="${p.y}" r="${EMO.DOT_R}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2"${p.value === null ? ' stroke-dasharray="3 3"' : ""}/>`;
    out += lvl
      ? `<text x="${p.x}" y="${p.y + 7}" text-anchor="middle" font-size="20">${lvl.face}</text>`
      : `<text x="${p.x}" y="${p.y + 5.5}" text-anchor="middle" font-size="15" font-weight="800" fill="#9aa9a0">?</text>`;
    out += `</g>`;
  }
  return out;
}

/** Faixa como elemento do canvas (SVG posicionado em coordenadas do mundo). */
export function emotionHtml(b: EmotionBand): string {
  const sel = state.selected?.kind === "node" && keyKind(state.selected.id) === "scene" ? keyId(state.selected.id) : "";
  return `<svg class="emo-band" xmlns="http://www.w3.org/2000/svg" style="left:${b.x}px;top:${b.top}px;width:${b.w}px;height:${b.height}px" viewBox="${b.x} ${b.top} ${b.w} ${b.height}">${emotionSvg(b, true, sel)}</svg>`;
}
