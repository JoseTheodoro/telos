import type { CollectionName, NodeKind } from "./types";

export const TYPES: NodeKind[] = [
  "journey",
  "chapter",
  "scene",
  "event",
  "domain",
  "system",
  "screen",
  "table",
  "semantic",
  "hotspot",
  "note",
  "frame",
];

/** Tipos posicionados à mão: "Organizar" não os move e eles não ocupam linha no layout automático. */
export const FREE_PLACED_KINDS: NodeKind[] = ["note", "frame"];

/** Tipos da hierarquia narrativa (jornada → capítulo → cena → evento). */
export const NARRATIVE_KINDS: NodeKind[] = ["journey", "chapter", "scene", "event"];

/** Rótulo de exibição por tipo. */
export const PL: Record<NodeKind, string> = {
  journey: "Jornada",
  chapter: "Capítulo",
  scene: "Cena",
  event: "Evento",
  domain: "Domínio",
  system: "Sistema",
  screen: "Tela",
  table: "Tabela",
  semantic: "Caixa livre",
  hotspot: "Hotspot",
  note: "Nota",
  frame: "Moldura",
};

/** Coleção do workspace onde cada tipo é armazenado. */
export const ARR: Record<NodeKind, CollectionName> = {
  journey: "journeys",
  chapter: "chapters",
  scene: "scenes",
  event: "events",
  domain: "domains",
  system: "systems",
  screen: "screens",
  table: "tables",
  semantic: "semanticNodes",
  hotspot: "decisions",
  note: "canvasNotes",
  frame: "frames",
};

export const COLORS: Record<NodeKind, string> = {
  journey: "#216750",
  chapter: "#3c8060",
  scene: "#58716a",
  event: "#ae7c34",
  domain: "#795ca1",
  system: "#547eac",
  screen: "#39886f",
  table: "#67768e",
  semantic: "#466e7d",
  hotspot: "#b3261e",
  note: "#9a7b2f",
  frame: "#6d8a7a",
};

export const FRAME_MIN = { w: 240, h: 140 };

/** #11 Cores de fundo das molduras (suaves, para ficar atrás dos post-its). */
export const FRAME_PALETTE: [string, string][] = [
  ["Verde", "#e3f1e7"],
  ["Azul", "#e1ecf8"],
  ["Lilás", "#ece5f6"],
  ["Âmbar", "#fbf0d9"],
  ["Rosa", "#f9e3ea"],
  ["Cinza", "#eceff1"],
];

export const TABLE_COLORS = { READ: "#ed8b23", WRITE: "#d84343" } as const;

export const EDGE_PALETTE: [string, string][] = [
  ["Vermelho", "#d84343"],
  ["Laranja", "#ed8b23"],
  ["Amarelo", "#e0ac23"],
  ["Verde", "#32976a"],
  ["Turquesa", "#159c9b"],
  ["Azul", "#337fc6"],
  ["Roxo", "#8058b9"],
  ["Rosa", "#cf6494"],
  ["Cinza", "#64748b"],
  ["Preto", "#26313b"],
];

export const UNDEFINED_SEMANTIC = "Não definido";
export const CONTAINMENT_LABEL = "contém";

export const SEMANTIC_BASE: string[] = [
  "Não definido",
  "Ação",
  "Estado",
  "Transição de estado",
  "Fato",
  "Evento de domínio",
  "Evento de integração",
  "Evento externo",
  "Evento temporal",
  "Evento clínico",
  "Evento operacional",
  "Comando",
  "Política",
  "Regra de negócio",
  "Invariante",
  "Decisão",
  "Condição",
  "Hipótese",
  "Entidade",
  "Agregado",
  "Objeto de valor",
  "Atributo",
  "Dado clínico",
  "Observação",
  "Diagnóstico",
  "Prescrição",
  "Solicitação",
  "Resultado",
  "Documento",
  "Artefato",
  "Processo",
  "Subprocesso",
  "Jornada",
  "Etapa",
  "Tarefa",
  "Atividade humana",
  "Atividade automática",
  "Ator",
  "Papel",
  "Responsável",
  "Capacidade de negócio",
  "Bounded Context",
  "Domínio",
  "Sistema interno",
  "Sistema externo",
  "Serviço",
  "API / Endpoint",
  "Mensageria / Tópico",
  "Fila / Subscription",
  "Read Model",
  "Projeção",
  "Consulta / Query",
  "Banco de dados",
  "Tabela / Coleção",
  "Integração",
  "Dependência",
  "Risco",
  "Pergunta em aberto",
  "Marco / Checkpoint",
  "Regra clínica",
  "Validação",
  "Evidência",
  "Indicador",
  "Objetivo",
  "Restrição",
];

export const NATURE_BASE: [string, string][] = [
  ["clinical", "Clínico"],
  ["care", "Assistencial"],
  ["operational", "Operacional"],
  ["audit", "Auditoria"],
  ["integration", "Integração"],
  ["unknown", "Em discussão"],
];

export const DEST_BASE: [string, string][] = [
  ["pep", "Prontuário / PEP"],
  ["timeline", "Linha do tempo clínica"],
  ["context", "Sistema de origem"],
  ["integration", "Mensageria / integração"],
  ["audit", "Auditoria"],
  ["none", "Não enviar ao PEP"],
  ["open", "A definir"],
];

export const HOTSPOT_STATUS_OPTIONS: [string, string][] = [
  ["Aberta", "Aberta"],
  ["Em validação", "Em validação"],
  ["Resolvida", "Resolvida"],
];

export const HOTSPOT_PRIORITY_OPTIONS: [string, string][] = [
  ["Alta", "Alta"],
  ["Média", "Média"],
  ["Baixa", "Baixa"],
];

/** Tipos criados pelo modal "Adicionar elemento" (nota e moldura têm criação própria). */
export const MODAL_TYPES = TYPES.filter((t) => t !== "note" && t !== "frame");

/** Hotspots não contam como "desenho" para canvas vazio e Limpar canvas. */
export const DRAWING_TYPES = TYPES.filter((t) => t !== "hotspot");

export const EDGE_STATUS_OPTIONS: [string, string][] = [
  ["Registrado", "Registrado na narrativa"],
  ["Hipótese", "Hipótese"],
  ["Em investigação", "Em investigação"],
  ["Validado", "Validado"],
  ["Descartado", "Descartado"],
];

export const NODE_W = 242;
export const NODE_H = 94;
/** Passo da grade de encaixe do arraste; o pontilhado do fundo usa o mesmo passo. */
export const GRID_STEP = 24;
/** Altura do ponto de ancoragem das setas dentro do card. */
export const PORT_Y = 46;

/** Coluna X de cada tipo no layout em camadas. */
export const COL: Record<NodeKind, number> = {
  journey: 55,
  chapter: 355,
  scene: 655,
  event: 955,
  domain: 1265,
  system: 1575,
  screen: 1885,
  table: 2195,
  semantic: 2510,
  hotspot: 2825,
  note: 3140,
  frame: 3455,
};

export const STORE = "pep-atlas-studio-v4";
export const LEGACY_STORE = "pep-atlas-studio-v3";
export const SCHEMA = "pep-atlas-studio-v4";
export const ACCEPTED_SCHEMAS = ["pep-atlas-studio-v4", "pep-atlas-studio-v3", "pep-discovery-atlas-v1"];

export const UNDO_LIMIT = 45;
