// #4 Hotspot no canvas: post-it de dúvida preso ao card que ele questiona.
import { NODE_H, NODE_W } from "../domain/constants";
import { DEFAULT_NAME, buildEntity, newEntityId } from "../domain/factory";
import { keyKind, nodeKey } from "../domain/keys";
import { edgeFor, syncMaps } from "../domain/model";
import type { NodeKey } from "../domain/types";
import { change } from "../core/history";
import { getByKey, state } from "../core/state";
import { $ } from "../ui/dom";
import { bringIntoView, localPoint } from "./camera";
import { startInlineEdit } from "./inline-edit";
import { activePositions, freeSpot, isTimeline, pos } from "./layout";
import { visible } from "./visibility";

/**
 * Cria um hotspot. Com um card selecionado, ele nasce ao lado, conectado
 * ("card → levanta dúvida → hotspot"); sem seleção, nasce no centro da tela.
 */
export function addHotspot(): void {
  const ws = state.ws;
  const sel = state.selected;
  const target: NodeKey | null = sel?.kind === "node" && getByKey(sel.id) && keyKind(sel.id) !== "hotspot" ? sel.id : null;
  const id = newEntityId(ws, "hotspot");
  const k = nodeKey("hotspot", id);
  const obj = buildEntity("hotspot", id, DEFAULT_NAME.hotspot, "Hotspot", () => "");

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
