// #3 Criação encadeada ("tempestade rápida"), na convenção de mapas mentais:
//   Tab   → próximo passo / filho, conectado, à direita
//   Enter → irmão (mesmo tipo e mesmo pai), abaixo
import { NODE_H, NODE_W, PL } from "../domain/constants";
import { DEFAULT_NAME, PARENT_FIELD, buildEntity, initMappings, newEntityId } from "../domain/factory";
import { keyKind, nodeKey } from "../domain/keys";
import { collection, defaultEdgeName, edgeFor, syncMaps } from "../domain/model";
import type { AnyEntity, NodeKey, NodeKind } from "../domain/types";
import { change } from "../core/history";
import { getByKey, setFocus, state } from "../core/state";
import { notify } from "../ui/dom";
import { bringIntoView } from "./camera";
import { startInlineEdit } from "./inline-edit";
import { activePositions, freeSpot, pos } from "./layout";
import { visible } from "./visibility";

export type QuickMode = "next" | "sibling";

const GAP_X = 70;
const GAP_Y = 30;

/** Tab: o que vem "depois" de cada tipo. Evento e caixa livre seguem a linha do tempo. */
const NEXT_OF: Partial<Record<NodeKind, NodeKind>> = {
  journey: "chapter",
  chapter: "scene",
  scene: "event",
  event: "event",
  semantic: "semantic",
  domain: "system",
  system: "screen",
  screen: "table",
};

interface Plan {
  kind: NodeKind;
  /** Campo de pai na hierarquia (chapter.journeyId etc.) e seu valor. */
  parent?: { field: "journeyId" | "chapter" | "sceneId"; id: string };
  /** Seta extra de origem → novo (fora a de "contém"). */
  linkFrom?: NodeKey;
  linkStatus?: string;
  /** Herda tipo semântico / natureza do elemento de origem. */
  inherit: boolean;
  direction: "right" | "below";
}

function planFor(origin: NodeKey, mode: QuickMode): Plan | null {
  const kind = keyKind(origin);
  const o = getByKey(origin) as AnyEntity;
  // Pai do próprio elemento (para irmãos e para "próximo" do mesmo tipo).
  const ownParentField = PARENT_FIELD[kind];
  const ownParent = ownParentField ? { field: ownParentField, id: String(o[ownParentField] ?? "") } : undefined;

  if (mode === "sibling") return { kind, parent: ownParent, inherit: true, direction: "below" };

  const next = NEXT_OF[kind];
  if (!next) return null;
  if (next === kind) {
    // Mesma linha do tempo: mesmo pai + seta de sequência.
    return { kind, parent: ownParent, linkFrom: origin, linkStatus: "Registrado", inherit: true, direction: "right" };
  }
  const childField = PARENT_FIELD[next];
  if (childField) return { kind: next, parent: { field: childField, id: o.id }, inherit: false, direction: "right" };
  // Ativos técnicos: filho conectado por seta (hipótese).
  return { kind: next, linkFrom: origin, linkStatus: "Hipótese", inherit: false, direction: "right" };
}

/** Abre o recorte (cena → capítulo → jornada → mapa completo) até o nó aparecer. */
function widenUntilVisible(k: NodeKey): void {
  for (let i = 0; i < 3 && !visible().has(k); i++) {
    if (state.focusScene) setFocus(state.focusJourney, state.focusChapter, "");
    else if (state.focusChapter) setFocus(state.focusJourney, "", "");
    else setFocus("", "", "");
  }
}

/** Insere logo após a origem quando são do mesmo tipo (ordem da árvore e do layout). */
function insertAfter(list: AnyEntity[], originId: string | null, obj: AnyEntity): void {
  const idx = originId ? list.findIndex((x) => x.id === originId) : -1;
  if (idx >= 0) list.splice(idx + 1, 0, obj);
  else list.push(obj);
}

export function quickCreate(mode: QuickMode): void {
  const sel = state.selected;
  if (sel?.kind !== "node" || !getByKey(sel.id)) {
    notify("Selecione um card para criar o próximo (Tab) ou um irmão (Enter).");
    return;
  }
  const origin = sel.id;
  const plan = planFor(origin, mode);
  if (!plan) {
    notify(`${PL[keyKind(origin)]}: use Enter para criar um irmão.`);
    return;
  }
  if (plan.parent && !plan.parent.id) {
    notify("Este elemento não tem pai definido; escolha-o no inspetor primeiro.");
    return;
  }

  const ws = state.ws;
  const src = getByKey(origin) as AnyEntity;
  const semantic = plan.inherit ? src.semanticType : "Não definido";
  const name = plan.kind === "semantic" && plan.inherit && semantic !== "Não definido" ? semantic : DEFAULT_NAME[plan.kind];
  const id = newEntityId(ws, plan.kind);
  const k = nodeKey(plan.kind, id);
  const inheritVal = (field: string) => (plan.inherit ? String(src[field] ?? "") : "");
  // Pai vem do plano; natureza/destino/acesso são herdados do irmão de origem.
  const obj = buildEntity(plan.kind, id, name, semantic, (field) =>
    plan.parent && field === plan.parent.field ? plan.parent.id : inheritVal(field),
  );

  change(() => {
    insertAfter(collection(ws, plan.kind), plan.kind === keyKind(origin) ? src.id : null, obj);
    initMappings(ws, plan.kind, id);
    if (plan.parent) {
      const parentKind = { journeyId: "journey", chapter: "chapter", sceneId: "scene" }[plan.parent.field];
      ws.graph.edges.push(edgeFor(ws, nodeKey(parentKind, plan.parent.id), k, "contém", "Registrado", "Criação rápida"));
    }
    if (plan.linkFrom)
      ws.graph.edges.push(
        edgeFor(ws, plan.linkFrom, k, defaultEdgeName(plan.linkFrom, k), plan.linkStatus, "Criação rápida"),
      );
    syncMaps(ws);
    widenUntilVisible(k);
    const o = pos(origin);
    const start = plan.direction === "right" ? { x: o.x + NODE_W + GAP_X, y: o.y } : { x: o.x, y: o.y + NODE_H + GAP_Y };
    activePositions()[k] = freeSpot(start, k);
    state.selected = { kind: "node", id: k };
  });
  bringIntoView(k, 0.7);
  startInlineEdit(k, { isNew: true, origin });
}

/** Rótulo do que Tab criaria a partir do tipo (para botões e dicas). */
export function nextLabel(kind: NodeKind): string | null {
  const next = NEXT_OF[kind];
  if (!next) return null;
  if (next === "event" && kind === "event") return "Próximo evento";
  if (next === "semantic") return "Próxima caixa";
  return DEFAULT_NAME[next];
}
