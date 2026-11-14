// Gramática visual do Event Storming: cada nó ganha a cor do post-it canônico.
// Fonte única de verdade para card, legenda, inspetor e export SVG.
import type { NodeKind } from "./types.ts";

export type EsCategory = "evento" | "comando" | "ator" | "agregado" | "politica" | "leitura" | "externo" | "hotspot";

export interface EsStyle {
  id: EsCategory;
  /** Nome curto na legenda. */
  label: string;
  /** Cor do post-it, em palavras (para o inspetor). */
  colorName: string;
  /** O que o post-it representa na oficina. */
  hint: string;
  bg: string;
  /** Borda lateral e texto do tipo (contraste ≥ 4.5:1 sobre bg). */
  accent: string;
  outline: string;
}

/** Ordem = ordem de leitura do fluxo Event Storming na legenda. */
export const ES_STYLES: EsStyle[] = [
  {
    id: "ator",
    label: "Ator",
    colorName: "amarelo",
    hint: "Quem age ou decide",
    bg: "#fff3a8",
    accent: "#6f5800",
    outline: "#e8d266",
  },
  {
    id: "comando",
    label: "Comando / Ação",
    colorName: "azul",
    hint: "Intenção: o que alguém pede ao sistema",
    bg: "#dcebfb",
    accent: "#1b5f9e",
    outline: "#9cc6ee",
  },
  {
    id: "agregado",
    label: "Agregado / Estado",
    colorName: "amarelo-claro",
    hint: "Quem guarda o estado e as invariantes",
    bg: "#fbf1d9",
    accent: "#7a5c14",
    outline: "#e6cf95",
  },
  {
    id: "evento",
    label: "Evento de domínio",
    colorName: "laranja",
    hint: "Fato relevante, sempre no passado",
    bg: "#ffe3c4",
    accent: "#9a4d00",
    outline: "#f5b97a",
  },
  {
    id: "politica",
    label: "Política / Regra",
    colorName: "lilás",
    hint: "Reação: “sempre que X, então Y”",
    bg: "#eee2fb",
    accent: "#6a37a8",
    outline: "#cdb2ee",
  },
  {
    id: "leitura",
    label: "Read model / Tela",
    colorName: "verde",
    hint: "Informação que apoia a decisão",
    bg: "#dcf3e3",
    accent: "#1d6e3f",
    outline: "#9fd8b3",
  },
  {
    id: "externo",
    label: "Sistema / Integração",
    colorName: "rosa",
    hint: "Sistema envolvido ou externo",
    bg: "#fde1ee",
    accent: "#a62a62",
    outline: "#f2a9c9",
  },
  {
    id: "hotspot",
    label: "Hotspot / Dúvida",
    colorName: "vermelho",
    hint: "Risco, conflito ou pergunta em aberto",
    bg: "#ffdedd",
    accent: "#b3261e",
    outline: "#f3a3a0",
  },
];

const BY_ID = Object.fromEntries(ES_STYLES.map((s) => [s.id, s])) as Record<EsCategory, EsStyle>;

/** Tipo semântico → categoria. O que não está aqui usa o padrão do tipo estrutural. */
export const SEMANTIC_TO_ES: Record<string, EsCategory> = {
  // Eventos
  Fato: "evento",
  "Evento de domínio": "evento",
  "Evento de integração": "evento",
  "Evento externo": "evento",
  "Evento temporal": "evento",
  "Evento clínico": "evento",
  "Evento operacional": "evento",
  "Transição de estado": "evento",
  // Comandos / ações
  Comando: "comando",
  Ação: "comando",
  Solicitação: "comando",
  Tarefa: "comando",
  "Atividade humana": "comando",
  "Atividade automática": "comando",
  // Atores
  Ator: "ator",
  Papel: "ator",
  Responsável: "ator",
  // Agregados / estado
  Agregado: "agregado",
  Entidade: "agregado",
  Estado: "agregado",
  "Objeto de valor": "agregado",
  // Políticas / regras
  Política: "politica",
  "Regra de negócio": "politica",
  "Regra clínica": "politica",
  Invariante: "politica",
  Decisão: "politica",
  Condição: "politica",
  Validação: "politica",
  Restrição: "politica",
  // Read models
  "Read Model": "leitura",
  Projeção: "leitura",
  "Consulta / Query": "leitura",
  // Sistemas / integração
  "Sistema externo": "externo",
  "Sistema interno": "externo",
  Serviço: "externo",
  "API / Endpoint": "externo",
  "Mensageria / Tópico": "externo",
  "Fila / Subscription": "externo",
  Integração: "externo",
  // Hotspots
  Hotspot: "hotspot",
  Risco: "hotspot",
  "Pergunta em aberto": "hotspot",
  Hipótese: "hotspot",
};

/** Padrão por tipo estrutural quando o tipo semântico não define categoria. */
export const KIND_TO_ES: Partial<Record<NodeKind, EsCategory>> = {
  event: "evento",
  system: "externo",
  screen: "leitura",
  hotspot: "hotspot",
};

/** Categoria ES do nó: tipo semântico tem prioridade sobre o tipo estrutural. */
export function esCategory(kind: NodeKind, semanticType: string | undefined): EsCategory | null {
  return (semanticType && SEMANTIC_TO_ES[semanticType]) || KIND_TO_ES[kind] || null;
}

export function esStyle(kind: NodeKind, semanticType: string | undefined): EsStyle | null {
  const cat = esCategory(kind, semanticType);
  return cat ? BY_ID[cat] : null;
}

/** Variáveis CSS do card (vazio = mantém o estilo estrutural do CSS). */
export function esCssVars(style: EsStyle | null): string {
  return style ? `--nodebg:${style.bg};--accent:${style.accent};--outline:${style.outline};` : "";
}
