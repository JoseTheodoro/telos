// Modal: criação de elementos, lista de conexões e limpeza do canvas.
import { ARR, CONTAINMENT_LABEL, COL, DRAWING_TYPES, MODAL_TYPES, PL } from "../domain/constants";
import { keyKind, nodeKey } from "../domain/keys";
import { CONTAINMENT, colorForEdge, deep, defaultEdgeName, edgeFor, syncMaps } from "../domain/model";
import { PARENT_FIELD, buildEntity, initMappings, newEntityId } from "../domain/factory";
import type { AnyEntity, Chapter, NodeKind, Scene } from "../domain/types";
import { change } from "../core/history";
import { cancelViewPersist, persist, persistViewNow } from "../core/persistence";
import { get, getByKey, label, setFocus, state } from "../core/state";
import { refreshAll, refreshTools } from "../app";
import { selectNode } from "../actions";
import { bringIntoView } from "../canvas/camera";
import { activePositions } from "../canvas/layout";
import { exportJson } from "../io/files";
import { picker, registryOptions, semOptions } from "./inspector";
import { $, $$, esc, field, notify, options, target } from "./dom";

const modal = () => $<HTMLDialogElement>("#modal");

export function createModal(
  t: NodeKind | null = null,
  x: number | null = null,
  y: number | null = null,
  parent: string | null = null,
  preferredSemantic = "",
): void {
  const ws = state.ws;
  if (!t) t = ws.scenes.length ? "event" : ws.journeys.length ? "chapter" : "journey";
  const boxes = MODAL_TYPES.map(
    (k) =>
      `<button type="button" class="btn sm ${k === t ? "primary" : ""}" data-modal-type="${k}" style="margin:0 4px 6px 0">${PL[k]}</button>`,
  ).join("");
  $("#modalBody").innerHTML =
    `<div class="eyebrow">EDITOR VISUAL</div><h2>Adicionar elemento</h2><p>Crie jornadas, etapas, eventos e ativos técnicos. Associe livremente com setas.</p><div class="field"><label>Elemento</label><div id="modalTypes">${boxes}</div></div><div class="field"><label>Nome / título</label><input class="input" id="newName" placeholder="Ex.: Sinais vitais aferidos"></div><div id="newExtra"></div><div class="modal-foot"><button class="btn" id="cancelModal">Cancelar</button><button class="btn primary" id="saveNew">＋ Criar elemento</button></div>`;
  const ds = modal().dataset;
  ds.kind = t;
  ds.x = x == null ? "" : String(x);
  ds.y = y == null ? "" : String(y);
  ds.parent = parent || "";
  ds.preferredSemantic = preferredSemantic || "";
  updateModalExtra();
  modal().showModal();
  $("#newName").focus();
}

function updateModalExtra(): void {
  const ws = state.ws;
  const ds = modal().dataset;
  const t = ds.kind as NodeKind;
  $$("[data-modal-type]").forEach((b) => b.classList.toggle("primary", b.dataset.modalType === t));
  const parent = ds.parent || "";
  let extra = "";
  if (t === "chapter")
    extra += options(
      "Jornada",
      "new.journeyId",
      parent.startsWith("journey:") ? parent.slice(8) : state.focusJourney || ws.journeys[0]?.id || "",
      picker("journey"),
    );
  if (t === "scene")
    extra +=
      options(
        "Capítulo",
        "new.chapter",
        parent.startsWith("chapter:") ? parent.slice(8) : state.focusChapter || "",
        picker("chapter"),
      ) +
      options(
        "Raia na timeline (quem age)",
        "new.lane",
        "outros",
        ws.lanes.map((l): [string, string] => [l.id, l.label]),
      );
  if (t === "event")
    extra +=
      options(
        "Cena",
        "new.sceneId",
        parent.startsWith("scene:")
          ? parent.slice(6)
          : state.focusScene || ws.scenes.filter((s) => s.chapter === state.focusChapter)[0]?.id || "",
        picker("scene"),
      ) +
      options("Natureza", "new.type", "unknown", registryOptions(ws.natureOptions, "unknown")) +
      options("Destino", "new.destination", "open", registryOptions(ws.destinationOptions, "open"));
  if (t === "table")
    extra +=
      field("Schema / tabela física", "new.physical", "") +
      options("Acesso padrão", "new.defaultAccess", "", [
        ["", "A definir"],
        ["READ", "READ · laranja"],
        ["WRITE", "WRITE · vermelho"],
      ]);
  const preferred = ds.preferredSemantic || "Não definido";
  // Hotspot é sempre o post-it vermelho: sem escolha de tipo semântico.
  if (t !== "hotspot")
    extra +=
      options("Tipo semântico", "new.semanticType", preferred, semOptions(preferred)) +
    `<div class="field"><label>Ou criar tipo semântico personalizado</label><input class="input" id="newCustomSemantic" placeholder="Ex.: Transição de estado"></div>`;
  $("#newExtra").innerHTML = extra;
}


function makeNew(): void {
  const ds = modal().dataset;
  let t = ds.kind as NodeKind;
  const name = $<HTMLInputElement>("#newName").value.trim();
  if (!name) {
    notify("Informe um nome para criar o elemento.");
    return;
  }
  const val = (k: string) => (document.getElementById("f-new." + k) as HTMLInputElement | null)?.value || "";
  const parentField = PARENT_FIELD[t];
  if (parentField && !val(parentField)) {
    notify(t === "chapter" ? "Escolha uma jornada." : t === "scene" ? "Escolha um capítulo." : "Escolha uma cena.");
    return;
  }
  const semantic = $<HTMLInputElement>("#newCustomSemantic")?.value.trim() || val("semanticType") || "Não definido";
  if (t === "semantic" && semantic.toLowerCase() === "hotspot") t = "hotspot"; // hotspot é nó próprio
  const id = newEntityId(state.ws, t);
  const obj = buildEntity(t, id, name, semantic, val);
  const k = nodeKey(t, id);
  const positions = activePositions();
  const sameKindY = Object.keys(positions)
    .filter((key) => keyKind(key) === t)
    .map((key) => positions[key].y + 130);
  const p = {
    x: ds.x !== "" ? Number(ds.x) : COL[t] + 10,
    y: ds.y !== "" ? Number(ds.y) : Math.max(90, ...sameKindY),
  };
  const parent = ds.parent || "";
  const ws = state.ws;

  change(() => {
    if (!ws.elementTypes.includes(semantic)) ws.elementTypes.push(semantic);
    (ws[ARR[t]] as AnyEntity[]).push(obj);
    activePositions()[k] = p;
    for (const [from, to] of CONTAINMENT)
      if (t === to)
        ws.graph.edges.push(edgeFor(ws, nodeKey(from, String(obj[PARENT_FIELD[t] as string])), k, CONTAINMENT_LABEL, "Registrado", "Cadastro manual"));
    initMappings(ws, t, id);
    if (parent && parent !== k && getByKey(parent) && !ws.graph.edges.some((e) => e.from === parent && e.to === k))
      ws.graph.edges.push(edgeFor(ws, parent, k, defaultEdgeName(ws, parent, k), "Hipótese", "Cadastro manual"));
    syncMaps(ws);
    state.selected = { kind: "node", id: k };
    // Leva o recorte até o elemento recém-criado.
    if (t === "journey") setFocus(id, "", "");
    if (t === "chapter") setFocus(String(obj.journeyId), id, "");
    if (t === "scene") {
      const chapter = String(obj.chapter);
      setFocus((get("chapter", chapter) as Chapter | undefined)?.journeyId || "", chapter, id);
    }
    if (t === "event") {
      const sceneId = String(obj.sceneId);
      const chapter = (get("scene", sceneId) as Scene | undefined)?.chapter || "";
      setFocus((get("chapter", chapter) as Chapter | undefined)?.journeyId || "", chapter, sceneId);
    }
  });
  modal().close();
  // O <dialog> devolve o foco ao botão que o abriu; solta para Tab/Enter encadearem a partir do card novo.
  (document.activeElement as HTMLElement | null)?.blur?.();
  if (!state.visibleKeys.has(k)) {
    setFocus("", "", "");
    refreshAll(false);
  }
  selectNode(k);
  bringIntoView(k);
  notify(`${PL[t]} criado e salvo no navegador`);
}

export function listConnections(): void {
  const txt = state.ws.graph.edges
    .map(
      (e) =>
        `${label(e.from)} → ${label(e.to)} [${e.accessMode ? e.accessMode + " · " : ""}${e.label} · ${e.status} · ${colorForEdge(e)}]`,
    )
    .join("\n");
  $("#modalBody").innerHTML =
    `<div class="eyebrow">MAPA DE RELAÇÕES</div><h2>Setas do Atlas</h2><p>As conexões de leitura e escrita são evidenciadas em laranja e vermelho.</p><textarea class="input area" style="height:340px" readonly>${esc(txt)}</textarea><div class="modal-foot"><button class="btn" id="cancelModal">Fechar</button></div>`;
  modal().showModal();
}

// Limpar canvas: apaga só o desenho; preserva hotspots, taxonomia e contexto do projeto.
export function confirmWipe(): void {
  const ws = state.ws;
  const nodes = DRAWING_TYPES.reduce((n, t) => n + (ws[ARR[t]] as AnyEntity[]).length, 0);
  const arrows = ws.graph.edges.length;
  const hotspots = ws.decisions?.length || 0;
  if (!nodes && !arrows) {
    notify("O canvas já está vazio. Os " + hotspots + " hotspots foram preservados.");
    return;
  }
  $("#modalBody").innerHTML =
    `<div class="eyebrow">LIMPEZA DO CANVAS</div><h2 style="color:#a64237">Limpar todos os nós e conexões?</h2><p class="wipe-note">Esta ação apaga <b>somente o desenho visual</b>: jornadas, capítulos, cenas, eventos, domínios, sistemas, telas, tabelas, suas setas e posições. <b>Os hotspots e suas decisões permanecem intactos</b>, assim como as classificações personalizadas.</p><div class="wipe-preview"><strong>${nodes} caixas</strong> e <strong>${arrows} setas</strong> serão apagadas.<br><strong style="color:#247653">${hotspots} hotspots serão mantidos.</strong></div><p class="wipe-note">Faça backup JSON antes de limpar. O canvas vazio será salvo e continuará vazio após refresh.</p><button class="btn" id="backupBeforeWipe" type="button">↓ Fazer backup JSON agora</button><div class="field" style="margin-top:17px"><label for="confirmWipeInput">Para confirmar, digite <b>APAGAR</b></label><input class="input wipe-input" id="confirmWipeInput" placeholder="APAGAR" autocomplete="off" spellcheck="false" aria-label="Digite APAGAR para confirmar"></div><div class="wipe-warning">Esta operação não poderá ser desfeita pelo editor. Um backup JSON permite restaurar o estado anterior.</div><div class="modal-foot"><button class="btn" id="cancelModal" type="button">Cancelar</button><button class="btn danger" id="executeWipe" type="button" disabled>✕ Limpar apenas o canvas</button></div>`;
  modal().showModal();
  $("#confirmWipeInput").focus();
}

function wipeWorkspace(): void {
  if ($<HTMLInputElement>("#confirmWipeInput")?.value.trim().toUpperCase() !== "APAGAR") return;
  cancelViewPersist();
  const old = state.ws;
  state.ws = {
    ...old,
    emptyWorkspace: true,
    journeys: [],
    chapters: [],
    scenes: [],
    events: [],
    domains: [],
    systems: [],
    screens: [],
    tables: [],
    semanticNodes: [],
    frames: [],
    decisions: deep(old.decisions || []),
    eventMappings: {},
    sceneMappings: {},
    graph: { positions: {}, edges: [], layouts: {} },
    view: { journey: "", chapter: "", scene: "", camera: { x: 44, y: 45, z: 1 }, sidebarTab: "journey" },
  };
  Object.assign(state, {
    selected: null,
    sidebarTab: "journey",
    search: "",
    connectStart: null,
    dragging: null,
    panning: null,
    mode: "pointer",
    undoStack: [],
    redoStack: [],
    visibleKeys: new Set(),
    cam: { x: 44, y: 45, z: 1 },
  });
  setFocus("", "", "");
  state.collapsed.clear();
  modal().close();
  $("#inspector").classList.remove("open");
  refreshTools();
  persist();
  refreshAll(false);
  persistViewNow();
  notify("Canvas limpo. Hotspots preservados. Estado salvo para refresh.");
}

export function bindModal(): void {
  modal().addEventListener("click", (e) => {
    const el = target(e);
    const typeBtn = el.closest<HTMLElement>("[data-modal-type]");
    if (typeBtn) {
      modal().dataset.kind = typeBtn.dataset.modalType;
      updateModalExtra();
    }
    if (el.id === "cancelModal") modal().close();
    if (el.id === "saveNew") makeNew();
    if (el.id === "backupBeforeWipe") exportJson();
    if (el.id === "executeWipe") wipeWorkspace();
  });
  modal().addEventListener("input", (e) => {
    const el = target(e) as HTMLInputElement;
    if (el.id === "confirmWipeInput")
      $<HTMLButtonElement>("#executeWipe").disabled = el.value.trim().toUpperCase() !== "APAGAR";
  });
}
