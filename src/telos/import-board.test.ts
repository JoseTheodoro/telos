import { describe, expect, it } from "vitest";
import type { Board, BoardIssue } from "@telos/domain";
import { describeIssues, importBoardFile } from "./import-board";
import type { BoardStore } from "./store";

const sticky = (id: string) => ({ id, kind: "domainEvent", text: "", x: 0, y: 0, w: 200, h: 120 });
const telos = (overrides: Record<string, unknown> = {}) => ({
  schema: "telos/v1",
  id: "origem",
  title: "Faturamento",
  stickies: [sticky("s-1")],
  ...overrides,
});
const jsonBlob = (value: unknown) => new Blob([typeof value === "string" ? value : JSON.stringify(value)]);

function memoryStore(save: (board: Board) => void = () => {}): BoardStore & { saved: Board[] } {
  const saved: Board[] = [];
  return {
    saved,
    list: () => [],
    get: () => null,
    create: () => {
      throw new Error("create não faz parte da importação");
    },
    save(board) {
      save(board);
      saved.push(board);
    },
  };
}

class UnreadableBlob extends Blob {
  override text(): Promise<string> {
    return Promise.reject(new DOMException("arquivo removido", "NotReadableError"));
  }
}

describe("describeIssues", () => {
  const issue = (path: string, code: BoardIssue["code"]): BoardIssue => ({ path, code });

  it("names the document, the board fields and each sticky field", () => {
    expect(describeIssues([issue("", "invalid_structure"), issue("stickies", "not_array"), issue("stickies.0.x", "not_number")])).toEqual([
      "documento: formato inválido",
      "post-its: deveria ser uma lista",
      "post-it 1, posição x: deveria ser um número",
    ]);
  });

  it("tells the coordinates and the sides apart", () => {
    expect(
      describeIssues([issue("stickies.0.y", "not_number"), issue("stickies.0.w", "not_finite"), issue("stickies.0.h", "not_number")]),
    ).toEqual([
      "post-it 1, posição y: deveria ser um número",
      "post-it 1, largura: deveria ser um número finito",
      "post-it 1, altura: deveria ser um número",
    ]);
  });

  it("points at the sticky itself when the whole item is malformed", () => {
    expect(describeIssues([issue("stickies.2", "invalid_structure")])).toEqual(["post-it 3: formato inválido"]);
  });

  it("falls back to the raw path for a field it does not know", () => {
    expect(describeIssues([issue("frames", "not_array"), issue("stickies.0.color", "not_string")])).toEqual([
      "frames: deveria ser uma lista",
      "post-it 1, color: deveria ser texto",
    ]);
  });

  it("lists three problems and counts the rest in the singular", () => {
    const issues = [0, 1, 2, 3].map((index) => issue(`stickies.${index}.text`, "not_string"));
    expect(describeIssues(issues)).toEqual([
      "post-it 1, texto: deveria ser texto",
      "post-it 2, texto: deveria ser texto",
      "post-it 3, texto: deveria ser texto",
      "e mais 1 problema",
    ]);
  });

  it("counts the rest in the plural", () => {
    const issues = [0, 1, 2, 3, 4].map((index) => issue(`stickies.${index}.kind`, "unknown_kind"));
    expect(describeIssues(issues).at(-1)).toBe("e mais 2 problemas");
  });

  it("reports only the schema when the file is not telos/v1", () => {
    expect(describeIssues([issue("schema", "unknown_schema"), issue("title", "not_string")])).toEqual([
      "O arquivo não é um canvas telos/v1.",
    ]);
  });
});

describe("importBoardFile", () => {
  it("saves the board under a fresh id and keeps the sticky ids", async () => {
    const store = memoryStore();
    const result = await importBoardFile(jsonBlob(telos()), store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.board.id).not.toBe("origem");
    expect(result.board.stickies.map(({ id }) => id)).toEqual(["s-1"]);
    expect(store.saved).toEqual([result.board]);
  });

  it.each([{ id: undefined }, { id: "" }, { id: 42 }])("accepts a board whose own id is %o", async (overrides) => {
    const store = memoryStore();
    const result = await importBoardFile(jsonBlob(telos(overrides)), store);
    expect(result.ok).toBe(true);
    expect(store.saved).toHaveLength(1);
  });

  it("rejects text that is not JSON", async () => {
    const store = memoryStore();
    expect(await importBoardFile(jsonBlob("{ não é json"), store)).toEqual({ ok: false, messages: ["O arquivo não é um JSON válido."] });
    expect(store.saved).toEqual([]);
  });

  it("rejects a JSON array without saving", async () => {
    const store = memoryStore();
    expect(await importBoardFile(jsonBlob([telos()]), store)).toEqual({ ok: false, messages: ["documento: formato inválido"] });
    expect(store.saved).toEqual([]);
  });

  it("reports a file that can no longer be read", async () => {
    const store = memoryStore();
    expect(await importBoardFile(new UnreadableBlob(), store)).toEqual({ ok: false, messages: ["Não foi possível ler o arquivo."] });
    expect(store.saved).toEqual([]);
  });

  it("reports a board the browser cannot store", async () => {
    const store = memoryStore(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    expect(await importBoardFile(jsonBlob(telos()), store)).toEqual({
      ok: false,
      messages: ["Não foi possível guardar o canvas neste navegador."],
    });
  });
});
