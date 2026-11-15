import { parseBoard, type Board, type BoardIssue } from "@telos/domain";
import type { BoardStore } from "./store";

export type ImportResult = { ok: true; board: Board } | { ok: false; messages: string[] };

const MAX_LISTED_ISSUES = 3;

const NOT_JSON = "O arquivo não é um JSON válido.";
const NOT_TELOS = "O arquivo não é um canvas telos/v1.";

const PROBLEM: Readonly<Record<BoardIssue["code"], string>> = {
  invalid_structure: "formato inválido",
  unknown_schema: "desconhecido",
  unknown_kind: "desconhecido",
  not_string: "deveria ser texto",
  not_number: "deveria ser um número",
  not_finite: "deveria ser um número finito",
  empty: "está vazio",
  not_array: "deveria ser uma lista",
  duplicate_id: "id repetido",
};

const BOARD_FIELD: Readonly<Record<string, string>> = { "": "documento", id: "id do canvas", title: "título", stickies: "post-its" };

const STICKY_FIELD: Readonly<Record<string, string>> = {
  id: "id",
  kind: "tipo",
  text: "texto",
  x: "posição",
  y: "posição",
  w: "tamanho",
  h: "tamanho",
};

function placeOf(path: string): string {
  const [collection, index, field] = path.split(".");
  if (collection !== "stickies" || index === undefined) return BOARD_FIELD[path] ?? path;
  const sticky = `post-it ${Number(index) + 1}`;
  return field === undefined ? sticky : `${sticky}, ${STICKY_FIELD[field] ?? field}`;
}

export function describeIssues(issues: readonly BoardIssue[]): string[] {
  if (issues.some(({ code }) => code === "unknown_schema")) return [NOT_TELOS];
  const listed = issues.slice(0, MAX_LISTED_ISSUES).map(({ path, code }) => `${placeOf(path)}: ${PROBLEM[code]}`);
  const hidden = issues.length - listed.length;
  return hidden > 0 ? [...listed, `e mais ${hidden} ${hidden === 1 ? "problema" : "problemas"}`] : listed;
}

function parseJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

export async function importBoardFile(file: File, store: BoardStore): Promise<ImportResult> {
  const json = parseJson(await file.text());
  if (!json.ok) return { ok: false, messages: [NOT_JSON] };
  const parsed = parseBoard(json.value);
  if (!parsed.ok) return { ok: false, messages: describeIssues(parsed.issues) };
  const board: Board = { ...parsed.board, id: crypto.randomUUID() };
  store.save(board);
  return { ok: true, board };
}
