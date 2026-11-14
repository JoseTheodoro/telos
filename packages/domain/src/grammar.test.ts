import { describe, expect, it } from "vitest";
import { edgeVerdict, upgradeWorkspace } from "./model.ts";

const workspace = () =>
  upgradeWorkspace({
    schema: "pep-atlas-studio-v4",
    journeys: [{ id: "j1", name: "Jornada", semanticType: "Processo" }],
    events: [{ id: "e1", name: "PedidoRegistrado", sceneId: "", type: "", destination: "", semanticType: "" }],
    semanticNodes: [
      { id: "cmd", name: "Registrar pedido", semanticType: "Comando" },
      { id: "pol", name: "Sempre que registrar, avisar", semanticType: "Política" },
    ],
    graph: { positions: {}, edges: [], layouts: {} },
  });

describe("edgeVerdict", () => {
  it("edgeVerdict flags grammar exceptions", () => {
    const ws = workspace();

    expect(edgeVerdict(ws, "event:e1", "semantic:cmd")).toEqual({
      applies: true,
      ok: false,
      from: "evento",
      to: "comando",
      bridge: "politica",
      expected: ["politica", "leitura", "evento", "externo"],
    });
    expect(edgeVerdict(ws, "event:e1", "semantic:pol")).toEqual({
      applies: true,
      ok: true,
      from: "evento",
      to: "politica",
      label: "dispara",
    });
  });
});
