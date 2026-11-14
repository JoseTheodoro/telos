// Ações do usuário sobre o grafo (seleção, conexão, exclusão, duplicação, foco).
import {
  keyId,
  keyKind,
  newId,
  nodeKey,
  childKeys,
  collection,
  deep,
  defaultEdgeName,
  edgeFor,
  edgeVerdict,
  isContainment,
  nameField,
  syncMaps,
  categoryLabel,
  newEntityId,
  type AnyEntity,
  type Chapter,
  type EventItem,
  type NodeKey,
  type PortSide,
  type Scene,
} from "@telos/domain";
import { change, refreshUndo } from "./core/history";
import { get, getByKey, label, related, selectedNodeKeys, setFocus, state } from "./core/state";
import { refreshAll, refreshTools } from "./app";
import { centerOn } from "./canvas/camera";
import { activePositions, pos } from "./canvas/layout";
import { renderEdges, renderGraph } from "./canvas/render";
import { renderInspector } from "./ui/inspector";
import { createModal } from "./ui/modal";
import { $, notify } from "./ui/dom";
import { focusScopeOf } from "./canvas/note";

const FRAME_NO_EDGE = "Moldura não tem setas: ligue os cards que estão dentro dela.";

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
  } else if (kind === "note" || kind === "frame") {
    focusScopeOf(k);
  } else if (kind === "hotspot") {
    // Hotspot abre no recorte do card narrativo que ele questiona (se houver).
    const anchor = related(k)
      .map((e) => (e.from === k ? e.to : e.from))
      .find((n) => ["scene", "event", "chapter", "journey"].includes(keyKind(n)));
    if (anchor) {
      ensureVisible(anchor);
      selectNode(k);
      centerOn(k);
      return;
    }
    setFocus("", "", "");
  } else setFocus("", "", "");
  refreshAll(true);
  selectNode(k);
  centerOn(k);
}

/** Lados escolhidos ao ligar pelas portas (#15); ausente = automático. */
export interface LinkSides {
  fromSide?: PortSide;
  toSide?: PortSide;
}

export function linkCreate(a: NodeKey, b: NodeKey, sides: LinkSides = {}): void {
  if (!a || !b || a === b) {
    notify("Escolha dois elementos diferentes.");
    return;
  }
  if (!getByKey(a) || !getByKey(b)) {
    notify("Origem ou destino inexistente.");
    return;
  }
  if (keyKind(a) === "frame" || keyKind(b) === "frame") {
    notify(FRAME_NO_EDGE);
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
    const relation = edgeFor(ws, a, b, defaultEdgeName(ws, a, b), containment ? "Registrado" : "Hipótese", "Criada manualmente no canvas");
    if (sides.fromSide) relation.fromSide = sides.fromSide;
    if (sides.toSide) relation.toSide = sides.toSide;
    ws.graph.edges.push(relation);
    state.selected = { kind: "edge", id: relation.id };
    syncMaps(ws);
  });
  const verdict = edgeVerdict(ws, a, b);
  if (verdict.applies && !verdict.ok)
    notify(
      `Seta criada fora do padrão Event Storming (${categoryLabel(verdict.from)} → ${categoryLabel(verdict.to)}). Veja a sugestão no inspetor.`,
    );
  else notify("Seta criada. Escolha acesso, cor e evidência no inspetor.");
}

export function beginConnect(k: NodeKey): void {
  if (keyKind(k) === "frame") {
    notify(FRAME_NO_EDGE);
    return;
  }
  state.connectStart = k;
  state.mode = "connect";
  refreshTools();
  notify("Clique no card de destino (ou numa bolinha dele, para escolher o lado de entrada).");
}

/** Modo Conectar: o segundo clique liga; clicar numa porta do destino fixa o lado de entrada. */
export function finishConnect(k: NodeKey, toSide?: PortSide): void {
  if (state.connectStart) {
    const a = state.connectStart;
    state.connectStart = null;
    linkCreate(a, k, { toSide });
  } else beginConnect(k);
}

/** Seleção de vários nós: uma chave vira seleção simples; nenhuma limpa a seleção. */
export function selectNodes(keys: NodeKey[]): void {
  const existing = [...new Set(keys)].filter((k) => getByKey(k));
  state.selected = existing.length > 1 ? { kind: "nodes", ids: existing } : existing.length ? { kind: "node", id: existing[0] } : null;
  renderInspector();
  renderGraph();
  openInspectorOnMobile();
}

export function toggleNodeSelection(k: NodeKey): void {
  const current = selectedNodeKeys();
  selectNodes(current.includes(k) ? current.filter((x) => x !== k) : [...current, k]);
}

const SINGLE_DELETE_QUESTION = "Excluir o elemento selecionado? Esta ação também remove suas setas associadas e pode ser desfeita.";
const FRAME_DELETE_QUESTION = "Excluir a moldura? Os cards que estão dentro dela continuam no canvas. Ctrl+Z desfaz.";

function deleteNode(k: NodeKey): void {
  const ws = state.ws;
  const t = keyKind(k);
  const o = getByKey(k);
  if (!o) return;
  collection(ws, t).splice(collection(ws, t).indexOf(o), 1);
  ws.graph.edges = ws.graph.edges.filter((x) => x.from !== k && x.to !== k);
  for (const lay of Object.values(ws.graph.layouts || {})) delete lay[k];
  if (t === "event") delete ws.eventMappings[o.id];
  if (t === "scene") delete ws.sceneMappings[o.id];
}

export function removeSelection(): void {
  const sel = state.selected;
  if (!sel) return;
  if (sel.kind === "edge") {
    if (!confirm(SINGLE_DELETE_QUESTION)) return;
    change(() => {
      state.ws.graph.edges = state.ws.graph.edges.filter((x) => x.id !== sel.id);
      syncMaps(state.ws);
      state.selected = null;
    });
    notify("Elemento excluído (Ctrl+Z desfaz)");
    return;
  }
  const keys = selectedNodeKeys().filter((k) => getByKey(k));
  if (!keys.length) return;
  // Filho que também está na seleção sai junto: só bloqueia quem deixaria filho órfão.
  const orphansOf = (k: NodeKey) => childKeys(state.ws, keyKind(k), keyId(k)).filter((c) => !keys.includes(c));
  const blocked = keys.filter((k) => orphansOf(k).length);
  if (blocked.length) {
    notify(
      keys.length === 1
        ? "Mova os " + orphansOf(keys[0]).length + " elementos filhos antes de excluir."
        : `Mova ou selecione também os filhos de ${blocked.slice(0, 3).map(label).join(", ")}${blocked.length > 3 ? "…" : ""} antes de excluir.`,
    );
    return;
  }
  const question =
    keys.length === 1
      ? keyKind(keys[0]) === "frame"
        ? FRAME_DELETE_QUESTION
        : SINGLE_DELETE_QUESTION
      : `Excluir os ${keys.length} elementos selecionados? As setas ligadas a eles também saem, e Ctrl+Z desfaz tudo de uma vez.`;
  if (!confirm(question)) return;
  change(() => {
    for (const k of keys) deleteNode(k);
    syncMaps(state.ws);
    state.selected = null;
  });
  notify(keys.length === 1 ? "Elemento excluído (Ctrl+Z desfaz)" : `${keys.length} elementos excluídos (Ctrl+Z desfaz)`);
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
  const nf = nameField(t);
  if (t !== "note") copy[nf] = String(o[nf] ?? "") + " (cópia)";
  if (t === "hotspot") copy.id = newEntityId(state.ws, t);
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
