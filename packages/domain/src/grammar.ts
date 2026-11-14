// #5 Gramática do Event Storming nas setas: sugere o rótulo e avisa (sem bloquear)
// quando uma ligação foge do fluxo Ator → Comando → Agregado → Evento → Política → Comando.
import { ES_STYLES, esCategory, type EsCategory } from "./es.ts";
import type { NodeKind } from "./types.ts";

/** Fluxo canônico entre categorias: origem → destino → rótulo sugerido. */
export const GRAMMAR: Partial<Record<EsCategory, Partial<Record<EsCategory, string>>>> = {
  ator: { comando: "executa", leitura: "consulta" },
  leitura: { ator: "informa" },
  comando: { agregado: "é tratado por", evento: "gera", externo: "é enviado a" },
  agregado: { evento: "emite" },
  externo: { evento: "emite" },
  evento: { politica: "dispara", leitura: "atualiza", evento: "precede", externo: "notifica" },
  politica: { comando: "aciona" },
};

/** Exceções por tipo semântico (modelagem de estados que a oficina já usa). */
const SEMANTIC_GRAMMAR: Record<string, string> = {
  "Estado→Ação": "habilita",
  "Ação→Estado": "leva a",
  "Estado→Estado": "transiciona para",
};

/** Tab numa caixa livre cria o próximo passo do fluxo (não uma cópia do mesmo tipo). */
const NEXT_SEMANTIC: Record<string, string> = { Ação: "Estado", Estado: "Ação" };
const NEXT_BY_CATEGORY: Partial<Record<EsCategory, string>> = {
  ator: "Comando",
  comando: "Agregado",
  agregado: "Evento de domínio",
  evento: "Política",
  politica: "Comando",
  leitura: "Ator",
  externo: "Evento de domínio",
};

export function nextSemanticType(semanticType: string | undefined, kind: NodeKind): string | null {
  if (semanticType && NEXT_SEMANTIC[semanticType]) return NEXT_SEMANTIC[semanticType];
  const cat = esCategory(kind, semanticType);
  return (cat && NEXT_BY_CATEGORY[cat]) || null;
}

export interface End {
  kind: NodeKind;
  semanticType?: string;
}

export type Verdict =
  | { applies: false }
  | { applies: true; ok: true; from: EsCategory; to: EsCategory; label: string }
  | {
      applies: true;
      ok: false;
      from: EsCategory;
      to: EsCategory;
      /** Categoria que normalmente fica entre as duas (ex.: Evento → [Política] → Comando). */
      bridge: EsCategory | null;
      /** O que normalmente sai da origem. */
      expected: EsCategory[];
    };

/**
 * A gramática só vale para o fluxo de Event Storming: setas com caixa livre
 * ou entre eventos. Setas de rastreabilidade (evento → sistema/tela/tabela,
 * cena → domínio…) e hotspots ficam fora.
 */
export function grammarFor(a: End, b: End): Verdict {
  if (a.kind === "hotspot" || b.kind === "hotspot") return { applies: false };
  const inFlow = a.kind === "semantic" || b.kind === "semantic" || (a.kind === "event" && b.kind === "event");
  const from = esCategory(a.kind, a.semanticType);
  const to = esCategory(b.kind, b.semanticType);
  if (!inFlow || !from || !to) return { applies: false };

  const special = SEMANTIC_GRAMMAR[`${a.semanticType}→${b.semanticType}`];
  if (special) return { applies: true, ok: true, from, to, label: special };
  const label = GRAMMAR[from]?.[to];
  if (label) return { applies: true, ok: true, from, to, label };

  const bridge = (Object.keys(GRAMMAR[from] || {}) as EsCategory[]).find((mid) => !!GRAMMAR[mid]?.[to]) ?? null;
  return { applies: true, ok: false, from, to, bridge, expected: Object.keys(GRAMMAR[from] || {}) as EsCategory[] };
}

export const categoryLabel = (c: EsCategory): string => ES_STYLES.find((s) => s.id === c)?.label ?? c;
