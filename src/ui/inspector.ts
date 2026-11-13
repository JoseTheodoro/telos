// Inspetor lateral: edição de nós, setas e hotspots.
import {
  EDGE_PALETTE,
  EDGE_STATUS_OPTIONS,
  HOTSPOT_PRIORITY_OPTIONS,
  HOTSPOT_STATUS_OPTIONS,
  PL,
} from "../domain/constants";
import { esStyle } from "../domain/es";
import { keyKind, newId, nodeKey } from "../domain/keys";
import { collection, colorForEdge, defaultEdgeName, edgeFor, isTableLink, syncMaps, validColor } from "../domain/model";
import type { AnyEntity, Edge, NodeKind, RegistryOption } from "../domain/types";
import { change, pushSnapshot } from "../core/history";
import { persist } from "../core/persistence";
import { degree, findEdge, getByKey, label, related, state } from "../core/state";
import { beginConnect, duplicateSelection, ensureVisible, safeRemoveSelection, selectEdge } from "../actions";
import { renderEdges, renderGraph } from "../canvas/render";
import { renderSidebar } from "./sidebar";
import { nextLabel, quickCreate } from "../canvas/quick-create";
import { $, $$, esc, field, notify, options, target } from "./dom";

const ACCESS_OPTIONS: [string, string][] = [
  ["", "A definir"],
  ["READ", "READ · laranja"],
  ["WRITE", "WRITE · vermelho"],
];

export function picker(kind: NodeKind, empty = "Não definido"): [string, string][] {
  return [["", empty], ...collection(state.ws, kind).map((o): [string, string] => [o.id, label(nodeKey(kind, o.id))])];
}

export function registryOptions(registry: RegistryOption[], current: string | undefined): [string, string][] {
  const values = registry.map((x): [string, string] => [x.id, x.label]);
  if (current && !values.some((v) => v[0] === current)) values.push([current, current + " (personalizado)"]);
  return values;
}

export function semOptions(current: string | undefined): [string, string][] {
  return [...new Set([...state.ws.elementTypes, ...(current ? [current] : [])])].map((x): [string, string] => [x, x]);
}

function emptyInspector(): string {
  return `<div class="hint"><b>Mapeamento guiado</b><br>Crie jornadas, capítulos, cenas e eventos. Conecte sistemas, telas e tabelas por setas com estado, cor, evidência e modo de acesso.</div><div class="sectionlabel">ATALHOS</div><div class="sub">Duplo clique: criar nó<br><br><span class="hotkey">C</span> conectar · <span class="hotkey">V</span> selecionar · <span class="hotkey">N</span> novo · <span class="hotkey">F2</span> renomear · <span class="hotkey">Tab</span> próximo conectado · <span class="hotkey">Enter</span> irmão · <span class="hotkey">H</span> hotspot no card · <span class="hotkey">Del</span> excluir · <span class="hotkey">Ctrl+Z</span> desfazer<br><br>Duplo clique no card: renomear</div>`;
}

function edgeInspector(e: Edge): string {
  const access = e.accessMode || "";
  const automatic = access === "READ" || access === "WRITE";
  const current = colorForEdge(e);
  const swatches = EDGE_PALETTE.map(
    ([name, hex]) =>
      `<button type="button" class="palette-swatch ${current === hex ? "is-active" : ""}" style="--swatch:${hex}" title="${name} (${hex})" aria-label="${name}" data-edge-color="${hex}"><span></span></button>`,
  ).join("");
  const accessField = isTableLink(e)
    ? options("Acesso à tabela", "edge.accessMode", access, [
        ["", "Não classificado"],
        ["READ", "READ · leitura (laranja)"],
        ["WRITE", "WRITE · escrita (vermelho)"],
      ])
    : "";
  const help = automatic
    ? "READ começa em laranja; WRITE em vermelho. Você pode sobrescrever a cor desta conexão."
    : "10 cores prontas, seletor visual (arraste para escolher) e HEX. Clique em Auto para usar a cor padrão.";
  return (
    `<div class="hint"><b>${esc(label(e.from))}</b><br>↓ ${esc(e.label)}<br><b>${esc(label(e.to))}</b></div>` +
    field("Significado da relação", "edge.label", e.label) +
    options("Estado da relação", "edge.status", e.status, EDGE_STATUS_OPTIONS) +
    accessField +
    `<div class="field"><label for="f-edge.color">Cor da conexão</label><div class="palette-swatches" role="group" aria-label="Escolher uma das dez cores">${swatches}</div><div class="color-field"><label class="color-label" for="f-edge.color"><input type="color" class="color-input" data-field="edge.color" id="f-edge.color" value="${current}" title="Escolher cor com mouse"></label><div class="hex-wrap"><label for="edgeHexInput">HEX</label><input id="edgeHexInput" class="input hex-input" maxlength="7" value="${current}" spellcheck="false" placeholder="#RRGGBB"></div><button type="button" class="btn sm" id="edgeAutoColor" title="Voltar para a cor automática">↺ Auto</button></div><small class="help">${help}</small></div>` +
    field("Evidência / referência", "edge.evidence", e.evidence, true, "SQL, rota, tela, pessoa que confirmou...") +
    field("Origem", "edge.source", e.source) +
    `<div class="sectionlabel">Ações</div><button class="btn danger" id="deleteButton">✕ Excluir seta</button>`
  );
}

/** Campos específicos por tipo de nó. */
function kindFields(kind: NodeKind, o: AnyEntity): string {
  const v = (k: string) => o[k] as string | undefined;
  switch (kind) {
    case "journey":
      return (
        field("Nome da jornada", "name", o.name) +
        field("Objetivo / contexto", "description", o.description, true) +
        field("Status", "status", o.status || "Em descoberta")
      );
    case "chapter":
      return (
        field("Nome do capítulo", "label", o.label) +
        options("Jornada", "journeyId", v("journeyId"), picker("journey")) +
        field("Data", "date", v("date")) +
        field("Título narrativo", "title", o.title) +
        field("Contexto / objetivo", "deck", v("deck"), true)
      );
    case "scene":
      return (
        field("Título da cena", "title", o.title) +
        options("Capítulo", "chapter", v("chapter"), picker("chapter")) +
        field("Momento / data", "time", v("time")) +
        field("Ator / equipe", "actor", v("actor")) +
        field("História / o que aconteceu", "story", v("story"), true) +
        field("Perguntas (uma por linha)", "questions", (o.questions as string[] | undefined)?.join("\n") || "", true) +
        field("Respostas (uma por linha)", "answers", (o.answers as string[] | undefined)?.join("\n") || "", true) +
        options("Discussão realizada", "discussed", String(!!o.discussed), [
          ["false", "Não"],
          ["true", "Sim"],
        ])
      );
    case "event":
      return (
        field("Evento no passado", "name", o.name) +
        options("Cena onde ocorreu", "sceneId", v("sceneId"), picker("scene")) +
        options("Natureza do evento", "type", v("type"), registryOptions(state.ws.natureOptions, v("type"))) +
        `<button class="btn sm add-choice" data-add-choice="nature">＋ Cadastrar natureza</button>` +
        options(
          "Destino do evento",
          "destination",
          v("destination"),
          registryOptions(state.ws.destinationOptions, v("destination")),
        ) +
        `<button class="btn sm add-choice" data-add-choice="destination">＋ Cadastrar destino</button>` +
        field("Observação original da oficina", "note", v("note"), true) +
        field("Revisão", "reviewStatus", v("reviewStatus") || "Em discussão") +
        field("Relevância para o PEP", "pepReason", v("pepReason") || "", true)
      );
    case "semantic":
      return (
        field("Nome / título", "name", o.name) +
        field("Definição / contexto", "description", o.description || "", true) +
        field("Status", "status", o.status || "Em descoberta") +
        field("Notas e evidências", "notes", o.notes || "", true)
      );
    case "domain":
      return field("Nome do domínio", "name", o.name) + field("Limite / responsabilidade", "description", o.description, true);
    case "system":
      return (
        field("Nome do sistema", "name", o.name) +
        field("Tipo / tecnologia", "kind", v("kind")) +
        options("Domínio proposto", "domainId", v("domainId") || "", picker("domain"))
      );
    case "screen":
      return (
        field("Nome da tela", "name", o.name) +
        field("Rota / módulo", "route", v("route")) +
        options("Sistema que expõe", "systemId", v("systemId") || "", picker("system"))
      );
    case "table":
      return (
        field("Nome da tabela", "name", o.name) +
        field("Schema / nome físico", "physicalName", v("physicalName")) +
        field("Chave / coluna de junção", "primaryKey", v("primaryKey")) +
        options("Sistema responsável", "systemId", v("systemId") || "", picker("system")) +
        options("Acesso padrão nas novas setas", "defaultAccess", v("defaultAccess") || "", ACCESS_OPTIONS) +
        `<div class="hint"><b>Acesso por seta</b><br>Uma mesma tabela pode receber WRITE de um sistema e READ de outros. Edite cada conexão para descrever quem lê e quem escreve.</div>`
      );
    case "hotspot":
      return (
        field("Dúvida / título", "title", o.title) +
        field("Descrição / contexto", "description", o.description, true) +
        options("Status", "status", o.status || "Aberta", HOTSPOT_STATUS_OPTIONS) +
        options("Prioridade", "priority", v("priority") || "Média", HOTSPOT_PRIORITY_OPTIONS) +
        field("Responsável", "owner", v("owner")) +
        field("Resolução / evidência", "resolution", v("resolution"), true) +
        `<div class="hint"><b>Hotspot no canvas</b><br>Ligue este post-it aos cards que ele questiona. Com um card selecionado, a tecla <span class="hotkey">H</span> cria um hotspot já conectado.</div>`
      );
  }
}

/** Explica qual post-it de Event Storming o elemento representa. */
function esHint(kind: NodeKind, semanticType: string | undefined): string {
  const es = esStyle(kind, semanticType);
  if (!es)
    return `<div class="es-hint"><span class="es-swatch es-swatch-neutral"></span><span>Estrutura da jornada: sem cor de Event Storming. Escolha um tipo semântico (ex.: Comando, Política) para virar post-it.</span></div>`;
  return `<div class="es-hint"><span class="es-swatch" style="background:${es.bg};border-color:${es.outline}"></span><span>Post-it <b>${es.colorName}</b> · ${esc(es.label)}<br><small>${esc(es.hint)}</small></span></div>`;
}

function nodeInspector(k: string, o: AnyEntity): string {
  const kind = keyKind(k);
  let content = kindFields(kind, o);
  if (["domain", "system", "screen", "table"].includes(kind)) {
    content +=
      options("Status do inventário", "status", o.status || "A validar", [
        ["A validar", "A validar"],
        ["Em investigação", "Em investigação"],
        ["Validado", "Validado"],
      ]) +
      field("Evidência de origem", "origin", o.origin || "", true) +
      field("Notas", "notes", o.notes || "", true);
  }
  // Hotspot é sempre o post-it vermelho: sem troca de tipo semântico.
  if (kind !== "hotspot")
    content +=
      `<div class="sectionlabel">Classificação do elemento</div>` +
      options("Tipo semântico", "semanticType", o.semanticType || "Não definido", semOptions(o.semanticType)) +
      `<button class="btn sm add-choice" data-add-choice="semantic">＋ Cadastrar novo tipo</button>` +
      esHint(kind, o.semanticType);
  const rels = related(k);
  const relRows = rels
    .slice(0, 70)
    .map((e) => {
      const neighbor = e.from === k ? e.to : e.from;
      return `<div class="rel"><span title="${esc(label(neighbor))}">${e.from === k ? "→" : "←"} ${esc(label(neighbor))}<br><small style="color:${colorForEdge(e)};font-weight:700">${esc(e.accessMode ? e.accessMode + " · " : "")}${esc(e.label)} · ${esc(e.status)}</small></span><button title="Inspecionar relação" data-inspect-edge="${esc(e.id)}">↗</button></div>`;
    })
    .join("");
  const next = nextLabel(kind);
  content +=
    `<div class="sectionlabel">Criar em sequência</div><div class="rowbtn">` +
    (next
      ? `<button class="btn sm primary" data-quick="next" title="Cria e conecta (Tab)">⇥ ${esc(next)} <span class="hotkey">Tab</span></button>`
      : "") +
    `<button class="btn sm" data-quick="sibling" title="Mesmo tipo e mesmo pai (Enter)">↵ Irmão <span class="hotkey">Enter</span></button></div>` +
    `<div class="sectionlabel">Setas deste elemento · ${rels.length}</div><div class="rowbtn"><button class="btn sm primary" id="startLinkBtn">⇢ Conectar a outro</button><button class="btn sm" id="focusItemBtn">◎ Focar</button></div>` +
    relRows +
    `<div class="sectionlabel">Ações</div><div class="rowbtn"><button class="btn" id="duplicateButton">⧉ Duplicar</button><button class="btn danger" id="deleteButton">✕ Excluir nó</button></div>`;
  return content;
}

export function renderInspector(): void {
  const title = $("#inspectTitle");
  const sub = $("#inspectSubtitle");
  const body = $("#inspectBody");
  const sel = state.selected;
  if (!sel) {
    title.textContent = "Selecione um elemento";
    sub.textContent = "Editor de conteúdo e conexões";
    body.innerHTML = emptyInspector();
    return;
  }
  if (sel.kind === "edge") {
    const e = findEdge(sel.id);
    if (!e) {
      state.selected = null;
      return renderInspector();
    }
    title.textContent = "Conexão / seta";
    sub.textContent = "Relação com semântica e evidência";
    body.innerHTML = edgeInspector(e);
    return;
  }
  const o = getByKey(sel.id);
  if (!o) {
    state.selected = null;
    return renderInspector();
  }
  title.textContent = label(sel.id);
  const kindLabel = keyKind(sel.id) === "hotspot" ? `Hotspot ${o.id}` : PL[keyKind(sel.id)];
  sub.textContent = `${kindLabel} · ${degree(sel.id)} conexões`;
  body.innerHTML = nodeInspector(sel.id, o);
}

/** Pais "estruturais" que, ao mudar no inspetor, recriam a seta correspondente. */
const PARENT_FIELDS: Record<string, { kind: NodeKind; parent: NodeKind; containment: boolean }> = {
  "chapter.journeyId": { kind: "chapter", parent: "journey", containment: true },
  "scene.chapter": { kind: "scene", parent: "chapter", containment: true },
  "event.sceneId": { kind: "event", parent: "scene", containment: true },
  "system.domainId": { kind: "system", parent: "domain", containment: false },
  "screen.systemId": { kind: "screen", parent: "system", containment: false },
  "table.systemId": { kind: "table", parent: "system", containment: false },
};

/** Aplica o valor de um campo (evento "change") com undo. */
function updateField(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void {
  const path = el.dataset.field;
  const sel = state.selected;
  if (!path || !sel) return;
  const value = el.value;
  const ws = state.ws;

  if (sel.kind === "edge") {
    const e = findEdge(sel.id) as unknown as Record<string, unknown> | undefined;
    const prop = path.slice(5);
    if (!e || e[prop] === value) return;
    change(() => {
      e[prop] = value;
      syncMaps(ws);
    });
    return;
  }
  const k = sel.id;
  const o = getByKey(k);
  const t = keyKind(k);
  if (!o || String(o[path] ?? "") === value) return;
  change(() => {
    if (path === "questions" || path === "answers") o[path] = value.split(/\r?\n/);
    else if (path === "discussed") o[path] = value === "true";
    else o[path] = value;

    const rule = PARENT_FIELDS[t + "." + path];
    if (!rule) return;
    if (rule.containment) {
      ws.graph.edges = ws.graph.edges.filter((e) => !(e.to === k && keyKind(e.from) === rule.parent && e.label === "contém"));
      ws.graph.edges.push(edgeFor(ws, nodeKey(rule.parent, value), k, "contém", "Registrado", "Inspetor"));
    } else {
      ws.graph.edges = ws.graph.edges.filter((e) => !(e.to === k && keyKind(e.from) === rule.parent));
      if (value) {
        const from = nodeKey(rule.parent, value);
        ws.graph.edges.push(edgeFor(ws, from, k, defaultEdgeName(from, k), "Hipótese", "Inspetor"));
      }
    }
  });
}

function setEdgeColor(color: string): void {
  if (state.selected?.kind !== "edge" || !validColor(color)) return;
  const edge = findEdge(state.selected.id);
  if (!edge || edge.color === color) return;
  change(() => {
    edge.color = color;
  });
  notify("Cor da conexão personalizada: " + color.toUpperCase());
}

function addCustomChoice(which: string): void {
  const sel = state.selected;
  if (!sel) return;
  const question =
    which === "semantic"
      ? "Nome do novo tipo de elemento:"
      : which === "nature"
        ? "Nome da nova natureza do evento:"
        : "Nome do novo destino do evento:";
  const name = prompt(question)?.trim();
  if (!name) return;
  change(() => {
    const o = getByKey(sel.id) as AnyEntity;
    if (which === "semantic") {
      if (!state.ws.elementTypes.includes(name)) state.ws.elementTypes.push(name);
      o.semanticType = name;
    } else {
      const list = which === "nature" ? state.ws.natureOptions : state.ws.destinationOptions;
      const val = "custom-" + newId();
      list.push({ id: val, label: name });
      o[which === "nature" ? "type" : "destination"] = val;
    }
  });
  notify("Classificação personalizada salva");
}

export function bindInspector(): void {
  const body = $("#inspectBody");

  // Snapshot tirado ao entrar no campo, mas só empilhado na primeira alteração real
  // (antes, apenas focar um campo criava um "desfazer" vazio).
  let pendingSnapshot: string | null = null;
  body.addEventListener("focusin", (e) => {
    const x = target(e);
    pendingSnapshot =
      x.dataset.field && (x.matches("textarea") || x.matches("input")) ? JSON.stringify(state.ws) : null;
  });

  // Edição ao vivo (a cada tecla) sem re-render do inspetor.
  body.addEventListener("input", (e) => {
    const x = target(e) as HTMLInputElement;
    const sel = state.selected;
    if (x.dataset.field === "edge.color" && x.matches("input[type=color]") && sel?.kind === "edge") {
      const edge = findEdge(sel.id);
      const color = validColor(x.value);
      if (edge && color) {
        edge.color = color;
        persist();
        renderEdges();
        $$(".palette-swatch").forEach((b) => b.classList.toggle("is-active", b.dataset.edgeColor === color));
        const hex = $<HTMLInputElement>("#edgeHexInput");
        if (hex) hex.value = color.toUpperCase();
      }
      return;
    }
    if (!x.dataset.field || !(x.matches("textarea") || x.matches("input:not([type=color])"))) return;
    if (!sel) return;
    if (pendingSnapshot) {
      pushSnapshot(pendingSnapshot);
      pendingSnapshot = null;
    }
    const path = x.dataset.field;
    const v = x.value;
    if (sel.kind === "edge" && path.startsWith("edge.")) {
      const o = findEdge(sel.id) as unknown as Record<string, unknown> | undefined;
      if (o) o[path.slice(5)] = v;
    } else if (sel.kind === "node") {
      const o = getByKey(sel.id);
      if (o) o[path] = path === "questions" || path === "answers" ? v.split(/\r?\n/) : v;
      $("#inspectTitle").textContent = label(sel.id);
    }
    persist();
    renderGraph();
    renderSidebar();
  });

  body.addEventListener("change", (e) => {
    const x = target(e) as HTMLInputElement;
    if (x.id === "edgeHexInput") {
      const color = validColor(x.value.trim());
      if (!color) {
        notify("HEX inválido. Use #RRGGBB.");
        x.value = colorForEdge(findEdge(state.selected?.id) || {});
        return;
      }
      setEdgeColor(color);
      return;
    }
    if (x.dataset.field) updateField(x);
  });

  body.addEventListener("click", (e) => {
    const el = target(e);
    const sw = el.closest<HTMLElement>("[data-edge-color]");
    if (sw) {
      setEdgeColor(sw.dataset.edgeColor as string);
      return;
    }
    if (el.closest("#edgeAutoColor")) {
      const edge = findEdge(state.selected?.id);
      if (edge && edge.color)
        change(() => {
          edge.color = "";
        });
      return;
    }
    const ed = el.closest<HTMLElement>("[data-inspect-edge]");
    if (ed) {
      selectEdge(ed.dataset.inspectEdge as string);
      return;
    }
    const add = el.closest<HTMLElement>("[data-add-choice]");
    if (add) {
      addCustomChoice(add.dataset.addChoice as string);
      return;
    }
    const quick = el.closest<HTMLElement>("[data-quick]");
    if (quick) {
      quickCreate(quick.dataset.quick === "next" ? "next" : "sibling");
      return;
    }
    const sel = state.selected;
    if (el.id === "startLinkBtn" && sel) beginConnect(sel.id);
    if (el.id === "deleteButton") safeRemoveSelection();
    if (el.id === "duplicateButton") duplicateSelection();
    if (el.id === "focusItemBtn" && sel) ensureVisible(sel.id);
  });
}
