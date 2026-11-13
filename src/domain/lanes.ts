// #7 Raias por ator: quem age em cada cena (campo explícito `scene.lane`).
import type { RegistryOption, Scene, Workspace } from "./types";

export const DEFAULT_LANE = "outros";

/** Ordem = ordem das raias na timeline (de cima para baixo). */
export const LANES_BASE: RegistryOption[] = [
  { id: "paciente", label: "Paciente / família" },
  { id: "recepcao", label: "Recepção / cadastro" },
  { id: "enfermagem", label: "Enfermagem" },
  { id: "medico", label: "Médico" },
  { id: "exames", label: "Exames / laudos" },
  { id: "sistema", label: "Sistemas / autoatendimento" },
  { id: "outros", label: "Outros / a definir" },
];

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Sugere a raia a partir do texto livre "Pessoa / Papel" (usado só na migração;
 * depois a raia é do usuário). Ordem importa: família antes de agendamento etc.
 */
export function inferLane(actor: string | undefined, patientName = ""): string {
  const a = fold(actor || "");
  if (!a.trim()) return DEFAULT_LANE;
  const rules: [RegExp, string][] = [
    [/esposa|marido|famil|acompanhante|paciente/, "paciente"],
    [/medic/, "medico"],
    [/enfermag|assistencial|triagem/, "enfermagem"],
    [/recep|cadastr|agendament|guiche/, "recepcao"],
    [/laborat|laudo|exame|imagem|radiolog|coleta/, "exames"],
    [/totem|aplicativo|\bapp\b|portal|sistema|autoatend/, "sistema"],
  ];
  for (const [re, lane] of rules) if (re.test(a)) return lane;
  if (patientName && a.includes(fold(patientName))) return "paciente";
  return DEFAULT_LANE;
}

/** Garante o catálogo de raias e a raia de cada cena (idempotente). */
export function upgradeLanes(ws: Workspace): void {
  if (!Array.isArray(ws.lanes) || !ws.lanes.length) ws.lanes = LANES_BASE.map((l) => ({ ...l }));
  const patient = String(ws.scenario?.patient ?? "");
  for (const s of ws.scenes as Scene[]) if (s.lane === undefined) s.lane = inferLane(s.actor, patient);
}

export function laneOf(ws: Workspace, scene: Scene | undefined): string {
  const id = scene?.lane || DEFAULT_LANE;
  return ws.lanes.some((l) => l.id === id) ? id : DEFAULT_LANE;
}
