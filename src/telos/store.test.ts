import { describe, expect, it } from "vitest";
import { createBoard } from "@telos/domain";
import { createLocalBoardStore } from "./store";

const INDEX_KEY = "telos:boards";

function memoryStorage(rejects: (key: string) => boolean = () => false): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem(key, value) {
      if (rejects(key)) throw new DOMException("cheio", "QuotaExceededError");
      items.set(key, value);
    },
  };
}

describe("createLocalBoardStore save", () => {
  it("leaves no board behind when the index cannot be written", () => {
    let indexFull = false;
    const storage = memoryStorage((key) => indexFull && key === INDEX_KEY);
    const store = createLocalBoardStore(storage);
    const board = createBoard("Faturamento");
    indexFull = true;
    expect(() => store.save(board)).toThrow();
    expect(store.get(board.id)).toBeNull();
    expect(storage.length).toBe(0);
  });

  it("keeps the new version of an existing board when only the index fails", () => {
    let indexFull = false;
    const storage = memoryStorage((key) => indexFull && key === INDEX_KEY);
    const store = createLocalBoardStore(storage);
    const board = store.create("Faturamento");
    indexFull = true;
    const renamed = { ...board, title: "Cobrança" };
    expect(() => store.save(renamed)).toThrow();
    expect(store.get(board.id)).toEqual(renamed);
  });
});
