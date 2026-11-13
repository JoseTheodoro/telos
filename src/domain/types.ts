// Modelo de dados do Atlas (schema persistido "pep-atlas-studio-v4").
// Mantido compatível com backups JSON da v1.5 e anteriores.

export type NodeKind =
  | "journey"
  | "chapter"
  | "scene"
  | "event"
  | "domain"
  | "system"
  | "screen"
  | "table"
  | "semantic"
  | "hotspot"
  | "note";

/** Chave de nó no grafo: `${kind}:${id}` (ex.: "scene:preconsulta"). */
export type NodeKey = string;

export type EdgeStatus = "Registrado" | "Hipótese" | "Em investigação" | "Validado" | "Descartado" | string;
export type AccessMode = "" | "READ" | "WRITE";

/** Campos comuns. Campos extras são preservados (dados antigos/customizados). */
export interface BaseEntity {
  id: string;
  semanticType: string;
  name?: string;
  label?: string;
  title?: string;
  description?: string;
  status?: string;
  notes?: string;
  origin?: string;
  [extra: string]: unknown;
}

export interface Journey extends BaseEntity {
  name: string;
}

export interface Chapter extends BaseEntity {
  label: string;
  title: string;
  journeyId: string;
  date: string;
  deck?: string;
  mood?: string;
  tone?: string;
}

export interface Scene extends BaseEntity {
  title: string;
  chapter: string;
  time: string;
  story?: string;
  actor?: string;
  questions?: string[];
  answers?: string[];
  discussed?: boolean;
  /** #7 Raia (quem age): id de `ws.lanes`. Inferida do `actor` na migração. */
  lane?: string;
  /** #8 Como a pessoa se sente na cena: −2 (muito ruim) … +2 (muito bom). Sem nota = undefined. */
  emotion?: number;
  /** #8 Dor / pain point da cena (texto livre). */
  pain?: string;
}

export interface EventItem extends BaseEntity {
  name: string;
  sceneId: string;
  type: string;
  destination: string;
  note?: string;
  reviewStatus?: string;
  reviewOwner?: string;
  pepReason?: string;
  source?: string;
}

export interface Domain extends BaseEntity {
  name: string;
}

export interface SystemItem extends BaseEntity {
  name: string;
  kind?: string;
  domainId?: string;
}

export interface Screen extends BaseEntity {
  name: string;
  route?: string;
  systemId?: string;
}

export interface Table extends BaseEntity {
  name: string;
  physicalName?: string;
  primaryKey?: string;
  systemId?: string;
  defaultAccess?: AccessMode;
}

export interface SemanticNode extends BaseEntity {
  name: string;
}

/** #10 Nota livre no canvas: texto, Markdown ou código (JSON, SQL, Bash…). */
export interface NoteItem extends BaseEntity {
  text: string;
  /** Id de `NOTE_FORMATS` ("text", "markdown", "json", "sql", "bash"…). */
  format: string;
  /** Tamanho do card (a nota é redimensionável). */
  w: number;
  h: number;
  /** Recorte onde a nota foi criada (`scopeKey()`): é lá que ela aparece. */
  scope: string;
}

/** #21 Nota do caderno (Markdown), opcionalmente vinculada a uma jornada ou capítulo. */
export interface DocNote {
  id: string;
  title: string;
  body: string;
  /** "journey:<id>" | "chapter:<id>" | "" (sem vínculo). */
  link: string;
  createdAt: string;
  updatedAt: string;
}

export type AnyEntity =
  | Journey
  | Chapter
  | Scene
  | EventItem
  | Domain
  | SystemItem
  | Screen
  | Table
  | SemanticNode
  | Decision
  | NoteItem;

export interface Edge {
  id: string;
  from: NodeKey;
  to: NodeKey;
  label: string;
  status: EdgeStatus;
  source: string;
  evidence: string;
  color: string;
  accessMode: AccessMode | string;
  /** Evento → domínio: papel explícito do domínio (substitui a heurística pelo rótulo). */
  role?: DomainRole;
  /** Ligação fora da gramática ES aceita conscientemente (oculta o aviso). */
  grammarException?: boolean;
}

export type DomainRole = "" | "owner" | "consumer";

/** Hotspot / dúvida da oficina. Armazenado em `ws.decisions` (compatível com a v1.5). */
export interface Decision extends BaseEntity {
  title: string;
  description: string;
  /** Legado da v1.5: cena de origem (migrado para uma seta na primeira carga). */
  sceneId?: string;
  priority?: string;
  status: string;
  owner: string;
  resolution: string;
}

export interface EventMapping {
  domainId: string;
  consumerDomainIds: string[];
  systemId: string;
  screenIds: string[];
  tableIds: string[];
  notes?: string;
  relationshipStatus?: string;
  operation?: string;
}

export interface SceneMapping {
  domainId: string;
  systemIds: string[];
  screenIds: string[];
  tableIds: string[];
  notes?: string;
  status?: string;
}

export interface Point {
  x: number;
  y: number;
}

export type Positions = Record<NodeKey, Point>;

export interface Camera {
  x: number;
  y: number;
  z: number;
}

export interface ViewState {
  journey?: string;
  chapter?: string;
  scene?: string;
  camera?: Camera;
  sidebarTab?: SidebarTab;
  legendCollapsed?: boolean;
  layoutMode?: LayoutMode;
  /** #7 Raias por ator ligadas na timeline. */
  lanes?: boolean;
  /** #8 Curva de emoção visível na timeline. */
  emotion?: boolean;
  /** #21 Área aberta (canvas/caderno), nota aberta e modo do editor. */
  area?: "canvas" | "docs";
  docId?: string;
  docsMode?: "edit" | "split" | "view";
}

/** "layers": colunas por tipo (v1.5) · "timeline": tempo da esquerda para a direita (v1.6). */
export type LayoutMode = "layers" | "timeline";

export interface RegistryOption {
  id: string;
  label: string;
}

export interface Graph {
  positions: Positions;
  edges: Edge[];
  /** Posições por recorte e modo: "all" | "scene:x"… (camadas) e "timeline|all" | "timeline|scene:x"… */
  layouts: Record<string, Positions>;
  /** Migração v1.6: hotspots com `sceneId` já viraram setas. */
  hotspotsLinked?: boolean;
}

export interface Workspace {
  schema: string;
  title?: string;
  scenario?: Record<string, string>;
  emptyWorkspace?: boolean;
  journeys: Journey[];
  /** #10 Notas livres do canvas. */
  canvasNotes: NoteItem[];
  /** #21 Caderno de notas Markdown. */
  docs: DocNote[];
  chapters: Chapter[];
  scenes: Scene[];
  events: EventItem[];
  domains: Domain[];
  systems: SystemItem[];
  screens: Screen[];
  tables: Table[];
  semanticNodes: SemanticNode[];
  decisions: Decision[];
  sceneMappings: Record<string, SceneMapping>;
  eventMappings: Record<string, EventMapping>;
  graph: Graph;
  elementTypes: string[];
  natureOptions: RegistryOption[];
  destinationOptions: RegistryOption[];
  /** #7 Catálogo de raias da timeline (ordem = de cima para baixo). */
  lanes: RegistryOption[];
  view: ViewState;
  [extra: string]: unknown;
}

export type CollectionName =
  | "journeys"
  | "chapters"
  | "scenes"
  | "events"
  | "domains"
  | "systems"
  | "screens"
  | "tables"
  | "semanticNodes"
  | "decisions"
  | "canvasNotes";

export type SidebarTab = "journey" | "inventory" | "decisions";
export type ToolMode = "pointer" | "connect";

export type Selection = { kind: "node" | "edge"; id: string } | null;
