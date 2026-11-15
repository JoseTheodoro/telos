import { parseBoard, type Board, type BoardIssue } from "@telos/domain";
import type { BoardStore } from "./store";

export type ImportResult = { ok: true; board: Board } | { ok: false; messages: string[] };

const MAX_LISTED_ISSUES = 3;

const NOT_JSON = "O arquivo não é um JSON válido.";
const NOT_TELOS = "O arquivo não é um canvas telos/v1.";
const NOT_READABLE = "Não foi possível ler o arquivo.";
const NOT_SAVED = "Não foi possível guardar o canvas neste navegador.";

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

const BOARD_FIELD: Readonly<Record<string, string>> = { "": "documento", title: "título", stickies: "post-its" };

const STICKY_FIELD: Readonly<Record<string, string>> = {
  id: "id",
  kind: "tipo",
  text: "texto",
  x: "posição x",
  y: "posição y",
  w: "largura",
  h: "altura",
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

const withFreshId = (value: unknown): unknown =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value, id: crypto.randomUUID() } : value;

async function readText(file: Blob): Promise<string | null> {
  try {
    return await file.text();
  } catch {
    return null;
  }
}

function trySave(store: BoardStore, board: Board): boolean {
  try {
    store.save(board);
    return true;
  } catch {
    return false;
  }
}

export async function importBoardFile(file: Blob, store: BoardStore): Promise<ImportResult> {
  const text = await readText(file);
  if (text === null) return { ok: false, messages: [NOT_READABLE] };
  const json = parseJson(text);
  if (!json.ok) return { ok: false, messages: [NOT_JSON] };
  const parsed = parseBoard(withFreshId(json.value));
  if (!parsed.ok) return { ok: false, messages: describeIssues(parsed.issues) };
  if (!trySave(store, parsed.board)) return { ok: false, messages: [NOT_SAVED] };
  return { ok: true, board: parsed.board };
}
