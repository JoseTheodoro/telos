// Estado de runtime da aplicação (único objeto mutável compartilhado entre módulos).
import { entityLabel, getEntity, getEntityByKey } from "../domain/model";
import type {
  AnyEntity,
  Camera,
  Edge,
  NodeKey,
  NodeKind,
  Selection,
  SidebarTab,
  ToolMode,
  Workspace,
} from "../domain/types";

export type Dragging =
  | { type: "link"; start: NodeKey }
  | {
      type: "node";
      key: NodeKey;
      dx: number;
      dy: number;
      x0: number;
      y0: number;
      snap: string;
      moved: boolean;
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

export function setFocus(journey: string, chapter: string, scene: string): void {
  state.focusJourney = journey;
  state.focusChapter = chapter;
  state.focusScene = scene;
}
