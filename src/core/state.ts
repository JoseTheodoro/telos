// Estado de runtime da aplicação (único objeto mutável compartilhado entre módulos).
import {
  entityLabel,
  getEntity,
  getEntityByKey,
  type AnyEntity,
  type Camera,
  type LayoutMode,
  type Edge,
  type NodeKey,
  type NodeKind,
  type Point,
  type PortSide,
  type Selection,
  type SidebarTab,
  type ToolMode,
  type Workspace,
} from "@pep-atlas/domain";
import type { GuideLines } from "../canvas/guides";

export type Dragging =
  | {
      /** Seta puxada de uma porta; `side` é o lado da porta de origem (#15). */
      type: "link";
      start: NodeKey;
      side: PortSide;
    }
  | {
      /** #10 Redimensionar uma nota livre pela alça do canto. */
      type: "resize";
      key: NodeKey;
      x0: number;
      y0: number;
      w0: number;
      h0: number;
      snap: string;
      moved: boolean;
    }
  | {
      /** #8 Arrastar o ponto da curva de emoção para cima/baixo. */
      type: "emotion";
      sceneId: string;
      startY: number;
      /** Nota no início do arraste (null = sem nota: começa do neutro). */
      from: number | null;
      snap: string;
      moved: boolean;
      drag: boolean;
    }
  | {
      type: "node";
      key: NodeKey;
      dx: number;
      dy: number;
      x0: number;
      y0: number;
      snap: string;
      moved: boolean;
      lines: GuideLines;
    }
  | {
      /** Arraste de um card da seleção múltipla: todos andam juntos, com um só undo. */
      type: "group";
      key: NodeKey;
      start: Point;
      origins: Record<NodeKey, Point>;
      snap: string;
      moved: boolean;
      lines: GuideLines;
    }
  | {
      /** Laço retangular (Shift + arraste no fundo), em coordenadas de tela. */
      type: "lasso";
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    }
  | null;

export type Panning = { x: number; y: number; oldX: number; oldY: number } | null;

export const state = {
  ws: null as unknown as Workspace,
  /** Recorte ativo do canvas (zoom semântico). Vazio = mapa completo. */
  focusJourney: "",
  focusChapter: "consulta",
  focusScene: "preconsulta",
  sidebarTab: "journey" as SidebarTab,
  legendCollapsed: false,
  layoutMode: "timeline" as LayoutMode,
  /** #7 Raias por ator na timeline. */
  lanes: true,
  /** #8 Curva de emoção acima da timeline. */
  emotion: true,
  /** #21 Área principal: canvas ou caderno de notas Markdown. */
  area: "canvas" as "canvas" | "docs",
  docId: "",
  docsFilter: "scope" as "scope" | "all" | "unlinked",
  docsMode: "split" as "edit" | "split" | "view",
  docsSearch: "",
  search: "",
  collapsed: new Set<string>(),
  mode: "pointer" as ToolMode,
  selected: null as Selection,
  connectStart: null as NodeKey | null,
  dragging: null as Dragging,
  panning: null as Panning,
  cam: { x: 40, y: 40, z: 0.78 } as Camera,
  visibleKeys: new Set<NodeKey>(),
  undoStack: [] as string[],
  redoStack: [] as string[],
};

// Atalhos ligados ao workspace atual.
export const get = (kind: NodeKind, id: string | undefined): AnyEntity | undefined =>
  getEntity(state.ws, kind, id);
export const getByKey = (k: NodeKey): AnyEntity | undefined => getEntityByKey(state.ws, k);
export const label = (k: NodeKey): string => entityLabel(state.ws, k);
export const related = (k: NodeKey): Edge[] => state.ws.graph.edges.filter((e) => e.from === k || e.to === k);
export const degree = (k: NodeKey): number => related(k).length;
export const findEdge = (id: string | undefined): Edge | undefined =>
  state.ws.graph.edges.find((e) => e.id === id);

export function selectedNodeKeys(): NodeKey[] {
  const sel = state.selected;
  if (sel?.kind === "node") return [sel.id];
  if (sel?.kind === "nodes") return sel.ids;
  return [];
}

export function selectedSingleNode(): NodeKey | null {
  return state.selected?.kind === "node" ? state.selected.id : null;
}

export function isNodeSelected(k: NodeKey): boolean {
  const sel = state.selected;
  if (sel?.kind === "node") return sel.id === k;
  return sel?.kind === "nodes" && sel.ids.includes(k);
}

export function setFocus(journey: string, chapter: string, scene: string): void {
  state.focusJourney = journey;
  state.focusChapter = chapter;
  state.focusScene = scene;
}
