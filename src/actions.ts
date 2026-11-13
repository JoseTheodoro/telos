// Ações do usuário sobre o grafo (seleção, conexão, exclusão, duplicação, foco).
import { keyId, keyKind, newId, nodeKey } from "./domain/keys";
import { childCount, collection, deep, defaultEdgeName, edgeFor, isContainment, syncMaps } from "./domain/model";
import type { AnyEntity, Chapter, EventItem, NodeKey, Scene } from "./domain/types";
import { change, refreshUndo } from "./core/history";
import { get, getByKey, setFocus, state } from "./core/state";
import { refreshAll, refreshTools } from "./app";
import { centerOn } from "./canvas/camera";
import { activePositions, pos } from "./canvas/layout";
import { renderEdges, renderGraph } from "./canvas/render";
import { renderInspector } from "./ui/inspector";
import { createModal } from "./ui/modal";
import { $, notify } from "./ui/dom";

function openInspectorOnMobile(): void {
  if (window.innerWidth < 930) $("#inspector").classList.add("open");
}

export function selectNode(k: NodeKey): void {
  if (!getByKey(k)) return;
  state.selected = { kind: "node", id: k };
  renderInspector();
  renderGraph();
  openInspectorOnMobile();
}

export function selectEdge(id: string): void {
  state.selected = { kind: "edge", id };
  renderInspector();
  renderEdges();
  renderGraph();
  openInspectorOnMobile();
}

export function selectDecision(id: string): void {
  state.selected = { kind: "decision", id };
  renderInspector();
}

/** Ajusta o recorte para que o nó apareça, seleciona e centraliza. */
export function ensureVisible(k: NodeKey): void {
  const kind = keyKind(k);
  const o = getByKey(k);
  if (!o) return;
  if (kind === "journey") setFocus(o.id, "", "");
  else if (kind === "chapter") setFocus((o as Chapter).journeyId, o.id, "");
  else if (kind === "scene") {
    const sc = o as Scene;
    const c = get("chapter", sc.chapter) as Chapter | undefined;
    setFocus(c?.journeyId || "", sc.chapter, sc.id);
  } else if (kind === "event") {
    const ev = o as EventItem;
    const s = get("scene", ev.sceneId) as Scene | undefined;
    const c = get("chapter", s?.chapter) as Chapter | undefined;
    setFocus(c?.journeyId || "", s?.chapter || "", ev.sceneId);
  } else setFocus("", "", "");
  refreshAll(true);
  selectNode(k);
  centerOn(k);
}

export function linkCreate(a: NodeKey, b: NodeKey): void {
  if (!a || !b || a === b) {
    notify("Escolha dois elementos diferentes.");
    return;
  }
  if (!getByKey(a) || !getByKey(b)) {
    notify("Origem ou destino inexistente.");
    return;
  }
  const { ws } = state;
  if (ws.graph.edges.some((x) => x.from === a && x.to === b)) {
    notify("Já há uma seta nessa direção. Selecione-a para editar.");
    return;
  }
  const na = keyKind(a);
  const nb = keyKind(b);
  const containment = isContainment(na, nb);
  change(() => {
    if (containment) {
      // Re-parent: o filho passa a pertencer ao novo pai (só um "contém" por nível).
      ws.graph.edges = ws.graph.edges.filter((x) => !(x.to === b && x.label === "contém" && keyKind(x.from) === na));
      const child = getByKey(b) as AnyEntity;
      if (na === "journey") (child as Chapter).journeyId = keyId(a);
      else if (na === "chapter") (child as Scene).chapter = keyId(a);
      else (child as EventItem).sceneId = keyId(a);
    }
    const relation = edgeFor(
      ws,
      a,
      b,
      defaultEdgeName(a, b),
      containment ? "Registrado" : "Hipótese",
      "Criada manualmente no canvas",
    );
    ws.graph.edges.push(relation);
    state.selected = { kind: "edge", id: relation.id };
    syncMaps(ws);
  });
  notify("Seta criada. Escolha acesso, cor e evidência no inspetor.");
}

export function beginConnect(k: NodeKey): void {
  state.connectStart = k;
  state.mode = "connect";
  refreshTools();
  notify("Selecione outro nó ou arraste até a bolinha de entrada para criar a seta.");
}

export function finishConnect(k: NodeKey): void {
  if (state.connectStart) {
    const a = state.connectStart;
    state.connectStart = null;
    linkCreate(a, k);
  } else beginConnect(k);
}

export function removeSelection(): void {
  const sel = state.selected;
  if (!sel) return;
  if (sel.kind === "node") {
    const o = getByKey(sel.id);
    const children = o ? childCount(state.ws, keyKind(sel.id), o.id) : 0;
    if (children) {
      notify("Mova os " + children + " elementos filhos antes de excluir.");
      return;
    }
  }
  if (!confirm("Excluir o elemento selecionado? Esta ação também remove suas setas associadas e pode ser desfeita."))
    return;
  change(() => {
    const ws = state.ws;
    if (sel.kind === "edge") {
      ws.graph.edges = ws.graph.edges.filter((x) => x.id !== sel.id);
      syncMaps(ws);
    } else if (sel.kind === "node") {
      const k = sel.id;
      const t = keyKind(k);
      const o = getByKey(k);
      if (!o) return;
      collection(ws, t).splice(collection(ws, t).indexOf(o), 1);
      ws.graph.edges = ws.graph.edges.filter((x) => x.from !== k && x.to !== k);
      for (const lay of Object.values(ws.graph.layouts || {})) delete lay[k];
      if (t === "event") delete ws.eventMappings[o.id];
      if (t === "scene") delete ws.sceneMappings[o.id];
      syncMaps(ws);
    }
    state.selected = null;
  });
  notify("Elemento excluído (Ctrl+Z desfaz)");
}

export function duplicateSelection(): void {
  if (state.selected?.kind !== "node") return;
  const k = state.selected.id;
  const t = keyKind(k);
  const o = getByKey(k);
  if (!o) return;
  if (t === "chapter" || t === "scene" || t === "event") {
    createModal(t, pos(k).x + 70, pos(k).y + 70);
    return;
  }
  const copy = deep(o);
  copy.id = "u" + newId();
  copy.name = (o.name || "") + " (cópia)";
  const nk = nodeKey(t, copy.id);
  change(() => {
    collection(state.ws, t).push(copy);
    activePositions()[nk] = { x: pos(k).x + 85, y: pos(k).y + 120 };
    state.selected = { kind: "node", id: nk };
  });
  notify("Cópia criada sem setas herdadas");
}

/** Remoção protegida usada por teclado e botões: desfaz o snapshot se algo falhar. */
export function safeRemoveSelection(): void {
  try {
    removeSelection();
  } catch (err) {
    alert((err as Error).message);
    state.undoStack.pop();
    refreshUndo();
  }
}
