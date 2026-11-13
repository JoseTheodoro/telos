// Renderização do canvas: cards (HTML) e setas (SVG).
import { ARR, NATURE_BASE, PL, PORT_SIDES, PORT_Y, TYPES } from "../domain/constants";
import { formatLabel, isCodeFormat, jsonError, renderNoteBody } from "../ui/rich";
import { keyKind } from "../domain/keys";
import { esCssVars, esStyle } from "../domain/es";
import { colorForEdge, edgeVerdict, isTableLink, semanticLabel } from "../domain/model";
import type {
  AnyEntity,
  Chapter,
  Edge,
  EventItem,
  NodeKey,
  Point,
  PortSide,
  Scene,
  Screen,
  SystemItem,
  Table,
} from "../domain/types";
import { degree, getByKey, isNodeSelected, label, state } from "../core/state";
import { $, esc, px, svgNumber } from "../ui/dom";
import { activePositions, calcBounds, isTimeline, pos, sizeOf } from "./layout";
import { chapterBands, laneBands } from "./timeline";
import { renderLaneGutter } from "./lane-gutter";
import { emotionBand, emotionHtml } from "./emotion";
import { emotionLevel, emotionSigned, hasEmotion } from "../domain/emotion";
import { renderLegend } from "./legend";
import { containedKeys } from "./frame";
import { visible } from "./visibility";

const NATURE_LABEL = Object.fromEntries(NATURE_BASE);

const svgPath = (parts: TemplateStringsArray, ...coordinates: number[]): string =>
  parts.reduce((path, part, index) => path + svgNumber(coordinates[index - 1]) + part);

export interface EdgeGeometry {
  d: string;
  /** Ponto da legenda da seta. */
  mx: number;
  my: number;
}

interface Size {
  w: number;
  h: number;
}

export type SizeLookup = (k: NodeKey) => Size;

/** Direção para fora do card em cada lado (a seta sai e chega perpendicular à borda). */
const OUTWARD: Record<PortSide, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

/**
 * Altura real dos cards de tamanho fixo, medida a cada `renderGraph`: o conteúdo faz o card passar
 * do `NODE_H` (91 a 112 px no seed), e a porta de baixo fica na borda real.
 */
const renderedHeights = new Map<NodeKey, number>();

function measureCardHeights(): void {
  for (const el of $("#nodes").children) {
    const k = (el as HTMLElement).dataset.node;
    const h = (el as HTMLElement).offsetHeight;
    // Com o caderno aberto o canvas fica oculto e mede 0: vale a medida anterior.
    if (k && h > 0 && keyKind(k) !== "note") renderedHeights.set(k, h);
  }
}

/** Tamanho do card na tela (altura medida); o SVG exportado usa `sizeOf`, igual aos retângulos que desenha. */
export function screenSizeOf(k: NodeKey): Size {
  const size = sizeOf(k);
  return { w: size.w, h: renderedHeights.get(k) ?? size.h };
}

/** Ponto da borda onde a seta encosta. Nas laterais dos cards fixos fica em `PORT_Y`, como sempre; nas notas, no meio. */
export function anchorOf(k: NodeKey, side: PortSide, size: Size): Point {
  const p = pos(k);
  const sideY = keyKind(k) === "note" ? size.h / 2 : PORT_Y;
  switch (side) {
    case "top":
      return { x: p.x + size.w / 2, y: p.y };
    case "bottom":
      return { x: p.x + size.w / 2, y: p.y + size.h };
    case "left":
      return { x: p.x, y: p.y + sideY };
    case "right":
      return { x: p.x + size.w, y: p.y + sideY };
  }
}

/** Lado do card voltado para um ponto (proporcional ao tamanho, para o card largo não virar sempre cima/baixo). */
function facingSide(k: NodeKey, size: Size, toward: Point): PortSide {
  const p = pos(k);
  const dx = toward.x - (p.x + size.w / 2);
  const dy = toward.y - (p.y + size.h / 2);
  if (Math.abs(dx) / (size.w / 2) >= Math.abs(dy) / (size.h / 2)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

function curveBetween(p1: Point, side1: PortSide, p2: Point, side2: PortSide): EdgeGeometry {
  const reach = Math.max(50, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.4);
  const c1 = { x: p1.x + OUTWARD[side1].x * reach, y: p1.y + OUTWARD[side1].y * reach };
  const c2 = { x: p2.x + OUTWARD[side2].x * reach, y: p2.y + OUTWARD[side2].y * reach };
  return {
    d: svgPath`M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`,
    // Meio da curva de Bézier (t = 0,5).
    mx: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8,
    my: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8,
  };
}

/**
 * Curva da seta com os dois lados automáticos (regra da v1.5):
 * destino à direita → sai pela direita; empilhado abaixo/acima → sai por baixo/cima;
 * destino atrás e na mesma altura → contorna por cima.
 */
function autoGeometry(a: NodeKey, b: NodeKey, sa: Size, sb: Size): EdgeGeometry {
  const p = pos(a);
  const q = pos(b);
  if (q.x >= p.x + sa.w + 20) {
    const x1 = p.x + sa.w;
    const y1 = p.y + PORT_Y;
    const x2 = q.x;
    const y2 = q.y + PORT_Y;
    const m = Math.max(65, (x2 - x1) * 0.48);
    return { d: svgPath`M ${x1} ${y1} C ${x1 + m} ${y1}, ${x2 - m} ${y2}, ${x2} ${y2}`, mx: (x1 + x2) / 2, my: (p.y + q.y) / 2 + 36 };
  }
  const below = q.y >= p.y + sa.h + 20;
  const above = q.y + sb.h + 20 <= p.y;
  if (below || above) {
    const x1 = p.x + sa.w / 2;
    const x2 = q.x + sb.w / 2;
    const y1 = below ? p.y + sa.h : p.y;
    const y2 = below ? q.y : q.y + sb.h;
    const m = Math.max(40, Math.abs(y2 - y1) * 0.48) * (below ? 1 : -1);
    return { d: svgPath`M ${x1} ${y1} C ${x1} ${y1 + m}, ${x2} ${y2 - m}, ${x2} ${y2}`, mx: (x1 + x2) / 2 + 8, my: (y1 + y2) / 2 };
  }
  const x1 = p.x + sa.w;
  const y1 = p.y + PORT_Y;
  const x2 = q.x;
  const y2 = q.y + PORT_Y;
  const cy = Math.min(y1, y2) - 105;
  const dx = 130;
  return {
    d: svgPath`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x1 + dx} ${cy}, ${(x1 + x2) / 2} ${cy} S ${x2 - 80} ${y2}, ${x2} ${y2}`,
    mx: (p.x + sa.w + q.x) / 2,
    my: (p.y + q.y) / 2 + 36,
  };
}

/**
 * #15 Curva da seta. Sem lados escolhidos, vale a regra automática de sempre. Com um lado escolhido,
 * a outra ponta usa o lado voltado para ele.
 */
export function edgeGeometry(e: Pick<Edge, "from" | "to" | "fromSide" | "toSide">, sizeOfKey: SizeLookup = screenSizeOf): EdgeGeometry {
  const sa = sizeOfKey(e.from);
  const sb = sizeOfKey(e.to);
  if (!e.fromSide && !e.toSide) return autoGeometry(e.from, e.to, sa, sb);
  let fromSide = e.fromSide;
  let toSide = e.toSide;
  if (!fromSide && toSide) fromSide = facingSide(e.from, sa, anchorOf(e.to, toSide, sb));
  if (fromSide && !toSide) toSide = facingSide(e.to, sb, anchorOf(e.from, fromSide, sa));
  const start = fromSide as PortSide;
  const end = toSide as PortSide;
  return curveBetween(anchorOf(e.from, start, sa), start, anchorOf(e.to, end, sb), end);
}

/** Prévia tracejada enquanto a seta é puxada de uma porta. */
export function linkGhostPath(start: NodeKey, side: PortSide, pointer: Point): string {
  const a = anchorOf(start, side, screenSizeOf(start));
  const reach = Math.max(60, Math.hypot(pointer.x - a.x, pointer.y - a.y) * 0.4);
  const c = { x: a.x + OUTWARD[side].x * reach, y: a.y + OUTWARD[side].y * reach };
  return svgPath`M ${a.x} ${a.y} C ${c.x} ${c.y}, ${pointer.x} ${pointer.y}, ${pointer.x} ${pointer.y}`;
}

const PORT_TITLE = "Arraste até outro card para ligar (solte numa bolinha para escolher o lado de entrada)";

function portsHtml(k: NodeKey): string {
  return PORT_SIDES.map((side) => `<div class="port ${side}" title="${PORT_TITLE}" data-port="${side}" data-key="${esc(k)}"></div>`).join("");
}

export function renderEdges(): void {
  const { ws, visibleKeys, selected } = state;
  const shown = ws.graph.edges.filter((e) => visibleKeys.has(e.from) && visibleKeys.has(e.to));
  let out = "<defs>";
  for (const e of shown) {
    out += `<marker id="head-${esc(e.id)}" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="${esc(colorForEdge(e))}"/></marker>`;
  }
  out += "</defs>";
  for (const e of shown) {
    const { d: p, mx, my } = edgeGeometry(e);
    const active = selected?.kind === "edge" && selected.id === e.id;
    const cls = active ? "selected" : e.status === "Validado" ? "valid" : e.status === "Hipótese" ? "proposed" : "";
    const color = colorForEdge(e);
    // #5: ligação fora da gramática ES ganha só um ⚠ discreto na legenda da seta.
    const verdict = edgeVerdict(ws, e.from, e.to);
    const offGrammar = verdict.applies && !verdict.ok && !e.grammarException;
    const caption =
      (offGrammar ? "⚠ " : "") + (e.accessMode ? e.accessMode + " · " + e.label : e.label || "relaciona");
    out += `<g data-edge="${esc(e.id)}"><path class="edge-hit" d="${p}" data-edge="${esc(e.id)}"/><path class="edge-line ${cls}" style="stroke:${esc(color)};stroke-width:${active ? 3.6 : 2.3}" d="${p}" marker-end="url(#head-${esc(e.id)})"/><text class="edge-caption${offGrammar ? " off-grammar" : ""}" x="${svgNumber(mx)}" y="${svgNumber(my)}" text-anchor="middle">${offGrammar ? "<title>Fora do padrão Event Storming — veja no inspetor</title>" : ""}${esc(caption)}</text></g>`;
  }
  $("#edgePaths").innerHTML = out;
}

/** Linha de resumo exibida abaixo do nome no card. */
function nodeSummary(k: NodeKey, o: AnyEntity): string | undefined {
  switch (keyKind(k)) {
    case "journey":
      return o.description;
    case "chapter":
      return (o as Chapter).date;
    case "scene":
      return (o as Scene).time;
    case "event": {
      const ev = o as EventItem;
      return (NATURE_LABEL[ev.type] || ev.type) + " · " + (ev.destination || "A decidir");
    }
    case "system":
      return (o as SystemItem).kind;
    case "table":
      return (o as Table).physicalName || "Tabela a identificar";
    case "screen":
      return (o as Screen).route || "Interface a investigar";
    case "hotspot":
      return `${o.id} · ${o.status || "Aberta"} · ${String(o.priority || "Média")}`;
    default:
      return o.status || "A investigar";
  }
}

function tableBadges(k: NodeKey): string {
  const links = state.ws.graph.edges.filter((e) => isTableLink(e) && (e.to === k || e.from === k));
  const reads = links.filter((e) => e.accessMode === "READ").length;
  const writes = links.filter((e) => e.accessMode === "WRITE").length;
  if (!reads && !writes) return "";
  return `<div class="table-badges">${writes ? `<span class="write-tag">WRITE ${writes}</span>` : ""}${reads ? `<span class="read-tag">READ ${reads}</span>` : ""}</div>`;
}

/** #8 Emoção e dor da cena no próprio card (visível também em Camadas). */
function sceneBadges(o: AnyEntity): string {
  const s = o as Scene;
  const pain = (s.pain || "").trim();
  if (!hasEmotion(s) && !pain) return "";
  const lvl = hasEmotion(s) ? emotionLevel(s.emotion) : null;
  return `<div class="scene-badges">${lvl ? `<span class="emo-tag" data-emo="${Math.sign(lvl.value)}" title="Emoção: ${esc(lvl.label)} (${emotionSigned(lvl.value)})">${lvl.face} ${esc(lvl.label)}</span>` : ""}${pain ? `<span class="pain-tag" title="Dor: ${esc(pain)}">⚡ Dor</span>` : ""}</div>`;
}

/** #10 Nota livre: post-it redimensionável com texto, Markdown ou código destacado. */
function noteHtml(k: NodeKey, o: AnyEntity): string {
  const p = pos(k);
  const { w, h } = sizeOf(k);
  const text = String(o.text ?? "");
  const fmt = String(o.format || "text");
  const isSelected = isNodeSelected(k);
  const bad = fmt === "json" ? jsonError(text) : null;
  return `<div class="node note ${isSelected ? "selected" : ""}" data-node="${esc(k)}" data-kind="note" data-format="${esc(fmt)}" data-code="${isCodeFormat(fmt) ? 1 : 0}" style="left:${px(p.x)};top:${px(p.y)};width:${px(w)};height:${px(h)}">${portsHtml(k)}<div class="note-head"><span class="note-fmt">${esc(formatLabel(fmt))}</span>${bad ? `<span class="note-warn" title="JSON inválido: ${esc(bad)}">⚠ inválido</span>` : ""}<span class="counter">${degree(k)}</span><button type="button" class="note-copy" data-note-copy="${esc(k)}" title="Copiar o conteúdo da nota">⧉ Copiar</button></div><div class="note-body">${renderNoteBody(text, fmt)}</div><div class="note-resize" data-note-resize="${esc(k)}" title="Arraste para redimensionar"></div></div>`;
}

/**
 * #11 A moldura tem duas camadas: o fundo fica atrás das setas; borda, título e alça ficam
 * entre as setas e os cards, para uma seta que cruza o título não roubar o clique.
 * Só o título e a alça recebem o mouse (o fundo deixa passar).
 */
function frameBgHtml(k: NodeKey): string {
  const p = pos(k);
  const { w, h } = sizeOf(k);
  return `<div class="frame-bg" data-frame-bg="${esc(k)}" style="left:${px(p.x)};top:${px(p.y)};width:${px(w)};height:${px(h)};--frame:${esc(String(getByKey(k)?.color))}"></div>`;
}

function frameHtml(k: NodeKey): string {
  const o = getByKey(k) as AnyEntity;
  const p = pos(k);
  const { w, h } = sizeOf(k);
  const inside = containedKeys(k).length;
  return `<div class="frame ${isNodeSelected(k) ? "selected" : ""}" data-node="${esc(k)}" data-kind="frame" style="left:${px(p.x)};top:${px(p.y)};width:${px(w)};height:${px(h)};--frame:${esc(String(o.color))}"><div class="frame-head" title="Arraste pelo título para mover a moldura com o que está dentro; duplo clique renomeia"><span class="name">${esc(label(k))}</span><span class="frame-count">${inside} ${inside === 1 ? "card" : "cards"}</span></div><div class="note-resize frame-resize" data-note-resize="${esc(k)}" title="Arraste para redimensionar"></div></div>`;
}

const areaOf = (k: NodeKey) => sizeOf(k).w * sizeOf(k).h;

function nodeHtml(k: NodeKey): string {
  const o = getByKey(k) as AnyEntity;
  if (keyKind(k) === "note") return noteHtml(k, o);
  const p = pos(k);
  const t = keyKind(k);
  // Não repete o tipo quando o semântico diz o mesmo (ex.: "Hotspot · Hotspot").
  const sem = semanticLabel(o).toLowerCase() === PL[t].toLowerCase() ? "" : semanticLabel(o);
  const isSelected = isNodeSelected(k);
  const es = esStyle(t, o.semanticType);
  return `<div class="node ${isSelected ? "selected" : ""}" data-node="${esc(k)}" data-kind="${esc(t)}" data-es="${es?.id ?? ""}"${t === "hotspot" ? ` data-status="${esc(o.status)}"` : ""} style="left:${px(p.x)};top:${px(p.y)};${esCssVars(es)}">${portsHtml(k)}<div class="kind">${PL[t]}${sem ? ` · ${esc(sem)}` : ""}<span class="counter">${degree(k)}</span></div><div class="name">${esc(label(k))}</div><div class="meta">${esc(nodeSummary(k, o) || "Sem descrição")}</div>${t === "table" ? tableBadges(k) : ""}${t === "scene" ? sceneBadges(o) : ""}</div>`;
}

const UNTITLED_WORKSPACE = "Mapa sem título";

function renderWorkspaceTitle(): void {
  const title = typeof state.ws.title === "string" ? state.ws.title.trim() : "";
  $("#workspaceTitle").textContent = title || UNTITLED_WORKSPACE;
}

/** Contadores do topo, da barra lateral e do rodapé (também com canvas vazio). */
function renderCounters(): void {
  const { ws, visibleKeys } = state;
  const edges = ws.graph.edges;
  const shownEdges = edges.filter((e) => visibleKeys.has(e.from) && visibleKeys.has(e.to)).length;
  $("#visCount").textContent = `${visibleKeys.size} nós · ${shownEdges} setas`;
  $("#counts").textContent =
    `${ws.journeys.length} jornadas · ${ws.chapters.length} capítulos · ${ws.scenes.length} cenas · ${ws.events.length} eventos`;
  const count = (fn: (e: (typeof edges)[number]) => boolean) => edges.filter(fn).length;
  $("#footerLeft").textContent =
    `${edges.length} relações · ${count((e) => e.status === "Validado")} validadas · ${count((e) => e.accessMode === "WRITE")} WRITE · ${count((e) => e.accessMode === "READ")} READ`;
}

/** Faixas de raia, de capítulo e a curva de emoção atrás dos cards (só na timeline). */
export function renderBands(): void {
  const el = $("#bands");
  if (!isTimeline()) {
    el.innerHTML = "";
    renderLaneGutter([]);
    return;
  }
  const lanes = laneBands(state.visibleKeys, activePositions());
  const emo = emotionBand(state.visibleKeys, activePositions());
  renderLaneGutter([
    ...(emo
      ? [
          {
            id: "__emotion",
            label: "Emoção",
            top: emo.top,
            height: emo.height,
            count: emo.rated,
            sub: `${emo.rated}/${emo.points.length} cenas com nota`,
            short: `${emo.rated}/${emo.points.length}`,
            kind: "emotion" as const,
          },
        ]
      : []),
    ...lanes,
  ]);
  const laneHtml = lanes
    .map(
      (b, i) =>
        `<div class="lane-band ${i % 2 ? "alt" : ""}" data-lane="${esc(b.id)}" style="left:${px(b.x)};top:${px(b.top)};width:${px(b.w)};height:${px(b.height)}"></div>`,
    )
    .join("");
  el.innerHTML = laneHtml + chapterBands(state.visibleKeys, activePositions())
    .map(
      (b, i) =>
        `<div class="chapter-band ${i % 2 ? "alt" : ""}" style="left:${px(b.x)};top:${px(b.y)};width:${px(b.w)};height:${px(b.h)}"><span class="chapter-band-label">${esc(b.label)}${b.date ? `<small>${esc(b.date)}</small>` : ""}</span></div>`,
    )
    .join("") + (emo ? emotionHtml(emo) : "");
}

/** Ao trocar de recorte, a seleção múltipla fica só com o que continua visível (Del e arraste agem no que se vê). */
function pruneMultiSelection(visibleKeys: Set<NodeKey>): void {
  const sel = state.selected;
  if (sel?.kind !== "nodes") return;
  const kept = sel.ids.filter((k) => visibleKeys.has(k));
  if (kept.length === sel.ids.length) return;
  state.selected = kept.length > 1 ? { kind: "nodes", ids: kept } : kept.length ? { kind: "node", id: kept[0] } : null;
}

export function renderGraph(): void {
  const { ws } = state;
  state.visibleKeys = visible();
  const visibleKeys = state.visibleKeys;
  pruneMultiSelection(visibleKeys);
  $("#emptyStage").hidden = TYPES.some((t) => ((ws[ARR[t]] as AnyEntity[] | undefined)?.length || 0) > 0);
  renderLegend();
  renderWorkspaceTitle();
  renderCounters();
  if (!visibleKeys.size) {
    $("#nodes").innerHTML = "";
    $("#frames").innerHTML = "";
    $("#frameUi").innerHTML = "";
    $("#bands").innerHTML = "";
    renderLaneGutter([]);
    renderEdges();
    return;
  }
  // Maiores primeiro: uma moldura dentro de outra fica por cima e continua clicável.
  const visibleFrames = [...visibleKeys].filter((k) => keyKind(k) === "frame").sort((a, b) => areaOf(b) - areaOf(a));
  $("#frames").innerHTML = visibleFrames.map(frameBgHtml).join("");
  $("#frameUi").innerHTML = visibleFrames.map(frameHtml).join("");
  $("#nodes").innerHTML = [...visibleKeys].filter((k) => keyKind(k) !== "frame").map(nodeHtml).join("");
  measureCardHeights();
  renderBands();
  const bounds = calcBounds();
  $("#world").style.width = Math.max(2800, bounds.maxX + 500) + "px";
  $("#world").style.height = Math.max(2500, bounds.maxY + 500) + "px";
  renderEdges();
}
