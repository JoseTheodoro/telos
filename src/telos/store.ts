import { createBoard, parseBoard, type Board } from "@telos/domain";

export interface BoardSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface BoardStore {
  list(): BoardSummary[];
  get(id: string): Board | null;
  create(title?: string): Board;
  save(board: Board): void;
}

const INDEX_KEY = "telos:boards";
const boardKey = (id: string): string => `telos:board:${id}`;

const isSummary = (value: unknown): value is BoardSummary =>
  typeof value === "object" &&
  value !== null &&
  ["id", "title", "updatedAt"].every((field) => typeof (value as Record<string, unknown>)[field] === "string");

function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function createLocalBoardStore(storage: Storage = localStorage): BoardStore {
  const readIndex = (): BoardSummary[] => {
    const index = parseJson(storage.getItem(INDEX_KEY));
    return Array.isArray(index) ? index.filter(isSummary) : [];
  };

  const save = (board: Board): void => {
    storage.setItem(boardKey(board.id), JSON.stringify(board));
    const summary: BoardSummary = { id: board.id, title: board.title, updatedAt: new Date().toISOString() };
    storage.setItem(INDEX_KEY, JSON.stringify([summary, ...readIndex().filter(({ id }) => id !== board.id)]));
  };

  return {
    list: () => readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    get(id) {
      const parsed = parseBoard(parseJson(storage.getItem(boardKey(id))));
      return parsed.ok && parsed.board.id === id ? parsed.board : null;
    },
    create(title) {
      const board = createBoard(title);
      save(board);
      return board;
    },
    save,
  };
}
