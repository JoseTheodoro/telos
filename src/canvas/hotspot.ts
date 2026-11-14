// #4 Hotspot no canvas: post-it de dúvida preso ao card que ele questiona.
import {
  NODE_H,
  NODE_W,
  DEFAULT_NAME,
  buildEntity,
  newEntityId,
  keyKind,
  nodeKey,
  edgeFor,
  syncMaps,
  type NodeKey,
} from "@pep-atlas/domain";
import { change } from "../core/history";
import { getByKey, state } from "../core/state";
import { $, notify } from "../ui/dom";
import { bringIntoView, localPoint } from "./camera";
import { startInlineEdit } from "./inline-edit";
import { activePositions, freeSpot, isTimeline, pos } from "./layout";
import { visible } from "./visibility";

/**
 * Cria um hotspot. Com um card selecionado, ele nasce ao lado, conectado
 * ("card → levanta dúvida → hotspot"); sem seleção, nasce no centro da tela.
 */
export function addHotspot(opts: { target?: NodeKey; name?: string } = {}): void {
  const ws = state.ws;
  const sel = state.selected;
  if (!opts.target && sel?.kind === "nodes") {
    notify(`Selecione um único card para ligar o hotspot (há ${sel.ids.length} selecionados).`);
    return;
  }
  const target: NodeKey | null =
    opts.target ??
    (sel?.kind === "node" && getByKey(sel.id) && keyKind(sel.id) !== "hotspot" && keyKind(sel.id) !== "frame" ? sel.id : null);
  const id = newEntityId(ws, "hotspot");
  const k = nodeKey("hotspot", id);
  // #8 "Virar hotspot" a partir da dor da cena já nasce com o texto da dor.
  const obj = buildEntity("hotspot", id, opts.name || DEFAULT_NAME.hotspot, "Hotspot", () => "");

  change(() => {
    ws.decisions.push(obj as (typeof ws.decisions)[number]);
    if (target) {
      ws.graph.edges.push(edgeFor(ws, target, k, "levanta dúvida", "Registrado", "Hotspot no canvas"));
      syncMaps(ws);
    }
    // Sem alvo, o hotspot solto só aparece no mapa completo.
    if (!target || !visible().has(k)) {
      state.focusJourney = state.focusChapter = state.focusScene = "";
    }
    let start;
    if (target) {
      const t = pos(target);
      // Timeline: hotspots ficam acima do card (linha de hotspots); camadas: ao lado.
      start = isTimeline() ? { x: t.x + 24, y: t.y - NODE_H - 50 } : { x: t.x + NODE_W + 50, y: t.y - NODE_H * 0.6 };
    } else {
      const r = $("#stage").getBoundingClientRect();
      const c = localPoint({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
      start = { x: c.x - NODE_W / 2, y: c.y - NODE_H / 2 };
    }
    activePositions()[k] = freeSpot(start, k, isTimeline() && target ? -1 : 1);
    state.selected = { kind: "node", id: k };
  });
  bringIntoView(k, 0.7);
  startInlineEdit(k, { isNew: true, origin: target ?? undefined });
}
