// Renderização do canvas: cards (HTML) e setas (SVG).
import { NATURE_BASE, NODE_W, PL, PORT_Y, TYPES, ARR } from "../domain/constants";
import { keyKind } from "../domain/keys";
import { esCssVars, esStyle } from "../domain/es";
import { colorForEdge, isTableLink, semanticLabel } from "../domain/model";
import type {
  AnyEntity,
  Chapter,
  EventItem,
  NodeKey,
  Scene,
  Screen,
  SystemItem,
  Table,
} from "../domain/types";
import { degree, getByKey, label, state } from "../core/state";
import { $, esc } from "../ui/dom";
import { calcBounds, pos } from "./layout";
import { renderLegend } from "./legend";
import { visible } from "./visibility";

const NATURE_LABEL = Object.fromEntries(NATURE_BASE);

/** Curva bezier da saída (direita) de `a` até a entrada (esquerda) de `b`. */
export function pathFor(a: NodeKey, b: NodeKey): string {
  const p = pos(a);
  const q = pos(b);
  const x1 = p.x + NODE_W;
  const y1 = p.y + PORT_Y;
  const x2 = q.x;
  const y2 = q.y + PORT_Y;
  if (x2 < x1 + 40) {
    // Destino à esquerda da origem: contorna por cima.
    const cy = Math.min(y1, y2) - 105;
    const dx = 130;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x1 + dx} ${cy}, ${(x1 + x2) / 2} ${cy} S ${x2 - 80} ${y2}, ${x2} ${y2}`;
  }
  const m = Math.max(65, (x2 - x1) * 0.48);
  return `M ${x1} ${y1} C ${x1 + m} ${y1}, ${x2 - m} ${y2}, ${x2} ${y2}`;
}

export function renderEdges(): void {
  const { ws, visibleKeys, selected } = state;
  const shown = ws.graph.edges.filter((e) => visibleKeys.has(e.from) && visibleKeys.has(e.to));
  let out = "<defs>";
  for (const e of shown) {
    out += `<marker id="head-${esc(e.id)}" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="${colorForEdge(e)}"/></marker>`;
  }
  out += "</defs>";
  for (const e of shown) {
    const p = pathFor(e.from, e.to);
    const active = selected?.kind === "edge" && selected.id === e.id;
    const a = pos(e.from);
    const b = pos(e.to);
    const mx = (a.x + NODE_W + b.x) / 2;
    const my = (a.y + b.y) / 2 + 36;
    const cls = active ? "selected" : e.status === "Validado" ? "valid" : e.status === "Hipótese" ? "proposed" : "";
    const color = colorForEdge(e);
    const caption = e.accessMode ? e.accessMode + " · " + e.label : e.label || "relaciona";
    out += `<g data-edge="${esc(e.id)}"><path class="edge-hit" d="${p}" data-edge="${esc(e.id)}"/><path class="edge-line ${cls}" style="stroke:${color};stroke-width:${active ? 3.6 : 2.3}" d="${p}" marker-end="url(#head-${esc(e.id)})"/><text class="edge-caption" x="${mx}" y="${my}" text-anchor="middle">${esc(caption)}</text></g>`;
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

function nodeHtml(k: NodeKey): string {
  const o = getByKey(k) as AnyEntity;
  const p = pos(k);
  const t = keyKind(k);
  const sem = semanticLabel(o);
  const isSelected = state.selected?.kind === "node" && state.selected.id === k;
  const es = esStyle(t, o.semanticType);
  return `<div class="node ${isSelected ? "selected" : ""}" data-node="${esc(k)}" data-kind="${esc(t)}" data-es="${es?.id ?? ""}" style="left:${p.x}px;top:${p.y}px;${esCssVars(es)}"><div class="port in" title="Entrada" data-port="in" data-key="${esc(k)}"></div><div class="port out" title="Arraste para conectar" data-port="out" data-key="${esc(k)}"></div><div class="kind">${PL[t]}${sem ? ` · ${esc(sem)}` : ""}<span class="counter">${degree(k)}</span></div><div class="name">${esc(label(k))}</div><div class="meta">${esc(nodeSummary(k, o) || "Sem descrição")}</div>${t === "table" ? tableBadges(k) : ""}</div>`;
}

export function renderGraph(): void {
  const { ws } = state;
  state.visibleKeys = visible();
  const visibleKeys = state.visibleKeys;
  $("#emptyStage").hidden = !TYPES.every((t) => !(ws[ARR[t]] as AnyEntity[]).length);
  renderLegend();
  if (!visibleKeys.size) {
    $("#nodes").innerHTML = "";
    renderEdges();
    return;
  }
  $("#nodes").innerHTML = [...visibleKeys].map(nodeHtml).join("");
  const bounds = calcBounds();
  $("#world").style.width = Math.max(2800, bounds.maxX + 500) + "px";
  $("#world").style.height = Math.max(2500, bounds.maxY + 500) + "px";
  renderEdges();

  const edges = ws.graph.edges;
  const shownEdges = edges.filter((e) => visibleKeys.has(e.from) && visibleKeys.has(e.to)).length;
  $("#visCount").textContent = `${visibleKeys.size} nós · ${shownEdges} setas`;
  $("#counts").textContent =
    `${ws.journeys.length} jornadas · ${ws.chapters.length} capítulos · ${ws.scenes.length} cenas · ${ws.events.length} eventos`;
  const count = (fn: (e: (typeof edges)[number]) => boolean) => edges.filter(fn).length;
  $("#footerLeft").textContent =
    `${edges.length} relações · ${count((e) => e.status === "Validado")} validadas · ${count((e) => e.accessMode === "WRITE")} WRITE · ${count((e) => e.accessMode === "READ")} READ`;
}
