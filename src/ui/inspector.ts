// Inspetor lateral: edição de nós, setas e hotspots.
import {
  EDGE_PALETTE,
  EDGE_STATUS_OPTIONS,
  HOTSPOT_PRIORITY_OPTIONS,
  HOTSPOT_STATUS_OPTIONS,
  PL,
} from "../domain/constants";
import { ES_STYLES, esStyle, type EsCategory } from "../domain/es";
import { categoryLabel } from "../domain/grammar";
import { DEFAULT_LANE, laneOf } from "../domain/lanes";
import { EMOTION_LEVELS, emotionSigned, hasEmotion } from "../domain/emotion";
import { addHotspot } from "../canvas/hotspot";
import { copyNote, rememberFormat, scopeName, startNoteEdit } from "../canvas/note";
import { docsLinkedTo, newDoc, openDoc } from "./docs";
import { NOTE_FORMATS, isCodeFormat, jsonError, prettyJson } from "./rich";
import { keyKind, newId, nodeKey } from "../domain/keys";
import {
  collection,
  colorForEdge,
  defaultEdgeName,
  edgeFor,
  edgeVerdict,
  isEventDomain,
  isTableLink,
  syncMaps,
  validColor,
} from "../domain/model";
import type { AnyEntity, Edge, NodeKey, NodeKind, NoteItem, RegistryOption, Scene } from "../domain/types";
import { change, pushSnapshot } from "../core/history";
import { persist } from "../core/persistence";
import { degree, findEdge, getByKey, label, related, selectedNodeKeys, selectedSingleNode, state } from "../core/state";
import {
  beginConnect,
  duplicateSelection,
  ensureVisible,
  safeRemoveSelection,
  selectEdge,
  selectNode,
  selectNodes,
} from "../actions";
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
  return `<div class="hint"><b>Mapeamento guiado</b><br>Crie jornadas, capítulos, cenas e eventos. Conecte sistemas, telas e tabelas por setas com estado, cor, evidência e modo de acesso.</div><div class="sectionlabel">ATALHOS</div><div class="sub">Duplo clique: criar nó<br><br><span class="hotkey">C</span> conectar · <span class="hotkey">V</span> selecionar · <span class="hotkey">N</span> novo · <span class="hotkey">F2</span> renomear · <span class="hotkey">Tab</span> próximo conectado · <span class="hotkey">Enter</span> irmão · <span class="hotkey">H</span> hotspot no card · <span class="hotkey">T</span> nota livre · <span class="hotkey">P</span> apresentar · <span class="hotkey">Del</span> excluir · <span class="hotkey">Ctrl+Z</span> desfazer<br><br>Duplo clique no card: renomear<br><span class="hotkey">Shift</span>+clique ou <span class="hotkey">Shift</span>+arraste no fundo: seleção múltipla</div>`;
}

function chip(c: EsCategory): string {
  const s = ES_STYLES.find((x) => x.id === c)!;
  return `<span class="es-chip" style="background:${s.bg};border-color:${s.outline};color:${s.accent}">${esc(s.label)}</span>`;
}

/** #5 Bloco da gramática Event Storming no inspetor da seta. */
function grammarBlock(e: Edge): string {
  const v = edgeVerdict(state.ws, e.from, e.to);
  if (!v.applies) return "";
  if (v.ok) {
    const useLabel =
      e.label !== v.label
        ? `<button type="button" class="btn sm" data-use-label="${esc(v.label)}">Usar “${esc(v.label)}”</button>`
        : "";
    return `<div class="grammar ok"><b>✓ Fluxo Event Storming</b><div class="grammar-flow">${chip(v.from)}<span>→ ${esc(v.label)} →</span>${chip(v.to)}</div>${useLabel}</div>`;
  }
  if (e.grammarException)
    return `<div class="grammar exception"><b>Exceção consciente</b><div class="grammar-flow">${chip(v.from)}<span>→</span>${chip(v.to)}</div><small>Fora do padrão Event Storming, aceita pelo time.</small><button type="button" class="btn sm" data-grammar-exception="off">Voltar a avisar</button></div>`;
  const hint = v.bridge
    ? `Normalmente há ${esc(categoryLabel(v.bridge))} entre eles: <b>${esc(categoryLabel(v.from))} → ${esc(categoryLabel(v.bridge))} → ${esc(categoryLabel(v.to))}.</b>`
    : v.expected.length
      ? `A partir de ${esc(categoryLabel(v.from))}, o esperado é: ${v.expected.map((c) => esc(categoryLabel(c))).join(", ")}.`
      : `${esc(categoryLabel(v.from))} normalmente não origina setas no fluxo Event Storming.`;
  return `<div class="grammar warn"><b>⚠ Fora do padrão Event Storming</b><div class="grammar-flow">${chip(v.from)}<span>→</span>${chip(v.to)}</div><small>${hint}</small><button type="button" class="btn sm" data-grammar-exception="on">Aceitar como exceção</button></div>`;
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
    grammarBlock(e) +
    field("Significado da relação", "edge.label", e.label) +
    (isEventDomain(e)
      ? options("Papel do domínio", "edge.role", e.role || "", [
          ["owner", "Responsável pelo evento"],
          ["consumer", "Consome o evento"],
          ["", "Não classificado"],
        ])
      : "") +
    options("Estado da relação", "edge.status", e.status, EDGE_STATUS_OPTIONS) +
    accessField +
    `<div class="field"><label for="f-edge.color">Cor da conexão</label><div class="palette-swatches" role="group" aria-label="Escolher uma das dez cores">${swatches}</div><div class="color-field"><label class="color-label" for="f-edge.color"><input type="color" class="color-input" data-field="edge.color" id="f-edge.color" value="${current}" title="Escolher cor com mouse"></label><div class="hex-wrap"><label for="edgeHexInput">HEX</label><input id="edgeHexInput" class="input hex-input" maxlength="7" value="${current}" spellcheck="false" placeholder="#RRGGBB"></div><button type="button" class="btn sm" id="edgeAutoColor" title="Voltar para a cor automática">↺ Auto</button></div><small class="help">${help}</small></div>` +
    field("Evidência / referência", "edge.evidence", e.evidence, true, "SQL, rota, tela, pessoa que confirmou...") +
    field("Origem", "edge.source", e.source) +
    `<div class="sectionlabel">Ações</div><button class="btn danger" id="deleteButton">✕ Excluir seta</button>`
  );
}

/** #8 Nota de emoção da cena (−2…+2), com "sem nota". */
function emotionField(s: Scene): string {
  const cur = hasEmotion(s) ? s.emotion : null;
  const btns = EMOTION_LEVELS.slice()
    .reverse()
    .map(
      (l) =>
        `<button type="button" class="emo-opt${cur === l.value ? " is-active" : ""}" data-emotion="${l.value}" data-sign="${Math.sign(l.value)}" aria-pressed="${cur === l.value}" title="${l.label} (${emotionSigned(l.value)})"><span>${l.face}</span><small>${emotionSigned(l.value)}</small></button>`,
    )
    .join("");
  const now = cur === null ? "Sem nota" : EMOTION_LEVELS.find((l) => l.value === cur)!.label;
  return `<div class="field"><label>Emoção na cena · <span class="emo-now">${esc(now)}</span></label><div class="emo-seg" role="group" aria-label="Como a pessoa se sente nesta cena">${btns}<button type="button" class="emo-opt emo-clear${cur === null ? " is-active" : ""}" data-emotion="" title="Sem nota" aria-pressed="${cur === null}"><span>—</span><small>sem</small></button></div><small class="help">Também dá para arrastar o ponto da cena na curva acima da timeline.</small></div>`;
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
        options(
          "Raia na timeline (quem age)",
          "lane",
          laneOf(state.ws, o as Scene),
          state.ws.lanes.map((l): [string, string] => [l.id, l.label]),
        ) +
        `<button class="btn sm add-choice" data-add-choice="lane">＋ Cadastrar raia</button>` +
        emotionField(o as Scene) +
        field("Dor / pain point", "pain", v("pain"), true, "O que trava, incomoda ou gera risco para quem vive a cena…") +
        `<button type="button" class="btn sm add-choice" data-pain-hotspot title="Cria um hotspot ligado a esta cena com o texto da dor"${(o as Scene).pain?.trim() ? "" : " disabled"}>⚡ Virar hotspot</button>` +
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
    case "note":
      return "";
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

/** Validação do JSON + botões (atualizados a cada tecla, sem re-render do inspetor). */
function noteTools(n: NoteItem): string {
  const bad = n.format === "json" ? jsonError(n.text) : null;
  const hint =
    n.format !== "json" || !n.text.trim()
      ? ""
      : bad
        ? `<small class="help note-bad">⚠ JSON inválido: ${esc(bad)}</small>`
        : `<small class="help">✓ JSON válido</small>`;
  return `${hint}<div class="rowbtn" style="margin-top:8px"><button type="button" class="btn sm" data-note-act="copy">⧉ Copiar</button><button type="button" class="btn sm" data-note-act="edit">✎ Editar no card <span class="hotkey">Enter</span></button>${n.format === "json" && !bad && n.text.trim() ? `<button type="button" class="btn sm" data-note-act="pretty">{ } Formatar JSON</button>` : ""}</div>`;
}

/** #10 Inspetor da nota livre: formato, conteúdo (editável aqui ou no card) e ações. */
function noteInspector(k: string, o: AnyEntity): string {
  const n = o as unknown as NoteItem;
  const rels = related(k);
  const relRows = rels
    .map((e) => {
      const neighbor = e.from === k ? e.to : e.from;
      return `<div class="rel"><span title="${esc(label(neighbor))}">${e.from === k ? "→" : "←"} ${esc(label(neighbor))}<br><small>${esc(e.label)}</small></span><button title="Inspecionar relação" data-inspect-edge="${esc(e.id)}">↗</button></div>`;
    })
    .join("");
  return (
    options(
      "Formato",
      "format",
      n.format,
      NOTE_FORMATS.map((f): [string, string] => [f.id, f.label]),
    ) +
    `<div class="field"><label for="f-text">Conteúdo</label><textarea class="input area note-src${isCodeFormat(n.format) ? " is-code" : ""}" data-field="text" id="f-text" spellcheck="${!isCodeFormat(n.format)}" placeholder="Texto, Markdown ou código…">${esc(n.text)}</textarea></div>` +
    `<div class="note-tools">${noteTools(n)}</div>` +
    `<small class="help">Aparece em: <b>${esc(scopeName(n.scope))}</b>. Duplo clique no card edita; arraste o canto ◢ para redimensionar.</small>` +
    `<div class="sectionlabel">Setas desta nota · ${rels.length}</div><div class="rowbtn"><button class="btn sm primary" id="startLinkBtn">⇢ Ligar a um card</button></div>` +
    relRows +
    `<div class="sectionlabel">Ações</div><div class="rowbtn"><button class="btn" id="duplicateButton">⧉ Duplicar</button><button class="btn danger" id="deleteButton">✕ Excluir nota</button></div>`
  );
}

/** #21 Notas do caderno vinculadas a esta jornada/capítulo. */
function linkedDocs(k: string): string {
  const docs = docsLinkedTo(k);
  const rows = docs
    .map(
      (d) =>
        `<button type="button" class="rel doc-rel" data-open-doc="${esc(d.id)}"><span>✎ ${esc(d.title || "Sem título")}</span><b>↗</b></button>`,
    )
    .join("");
  return `<div class="sectionlabel">Caderno · ${docs.length} nota${docs.length === 1 ? "" : "s"}</div>${rows}<button type="button" class="btn sm add-choice" data-new-doc="${esc(k)}">＋ Nova nota no caderno</button>`;
}

function nodeInspector(k: string, o: AnyEntity): string {
  const kind = keyKind(k);
  if (kind === "note") return noteInspector(k, o);
  let content = kindFields(kind, o);
  if (kind === "journey" || kind === "chapter") content += linkedDocs(k);
  if (INVENTORY_KINDS.includes(kind)) {
    content +=
      options("Status do inventário", "status", o.status || "A validar", INVENTORY_STATUS_OPTIONS) +
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
  const next = nextLabel(kind, o.semanticType);
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

const INVENTORY_KINDS: NodeKind[] = ["domain", "system", "screen", "table"];
const INVENTORY_STATUS_OPTIONS: [string, string][] = [
  ["A validar", "A validar"],
  ["Em investigação", "Em investigação"],
  ["Validado", "Validado"],
];

/**
 * Campos editáveis em lote. Cada tipo de nó tem o próprio vocabulário de status,
 * então cada campo vale só para os tipos em que existe como lista.
 */
interface BatchField {
  id: string;
  field: string;
  label: string;
  appliesTo: (kind: NodeKind) => boolean;
  choices: (current: string) => [string, string][];
}

const BATCH_FIELDS: BatchField[] = [
  {
    id: "semanticType",
    field: "semanticType",
    label: "Tipo semântico",
    appliesTo: (kind) => kind !== "hotspot" && kind !== "note",
    choices: (current) => semOptions(current || undefined),
  },
  {
    id: "inventoryStatus",
    field: "status",
    label: "Status do inventário",
    appliesTo: (kind) => INVENTORY_KINDS.includes(kind),
    choices: () => INVENTORY_STATUS_OPTIONS,
  },
  {
    id: "hotspotStatus",
    field: "status",
    label: "Status do hotspot",
    appliesTo: (kind) => kind === "hotspot",
    choices: () => HOTSPOT_STATUS_OPTIONS,
  },
];

const BATCH_LIST_LIMIT = 40;

function batchFieldHtml(f: BatchField, keys: NodeKey[]): string {
  const targets = keys.filter((k) => f.appliesTo(keyKind(k)));
  if (!targets.length) return "";
  const values = new Set(targets.map((k) => String(getByKey(k)?.[f.field] ?? "")));
  const shared = values.size === 1 ? [...values][0] : "";
  const placeholder: [string, string] = ["", values.size === 1 ? "— escolher —" : "Valores diferentes"];
  const opts = [placeholder, ...f.choices(shared)]
    .map(([v, n]) => `<option value="${esc(v)}" ${v && v === shared ? "selected" : ""}>${esc(n)}</option>`)
    .join("");
  return `<div class="field"><label for="batch-${esc(f.id)}">${esc(f.label)} <small class="batch-scope">· ${targets.length} de ${keys.length}</small></label><select class="input" id="batch-${esc(f.id)}" data-batch="${esc(f.id)}">${opts}</select></div>`;
}

function batchInspector(keys: NodeKey[]): string {
  const rows = keys
    .slice(0, BATCH_LIST_LIMIT)
    .map(
      (k) =>
        `<div class="rel"><span title="${esc(label(k))}">${esc(PL[keyKind(k)])} · ${esc(label(k))}</span><button type="button" title="Selecionar só este" data-select-only="${esc(k)}">↗</button></div>`,
    )
    .join("");
  const more = keys.length > BATCH_LIST_LIMIT ? `<div class="smallnote">… e mais ${keys.length - BATCH_LIST_LIMIT}</div>` : "";
  const fields = BATCH_FIELDS.map((f) => batchFieldHtml(f, keys)).join("");
  return (
    `<div class="hint"><b>Seleção múltipla</b><br>Arraste qualquer um destes cards para mover todos. <span class="hotkey">Shift</span>+clique adiciona ou tira um card; <span class="hotkey">Shift</span>+arraste no fundo seleciona uma área; <span class="hotkey">Del</span> exclui todos; <span class="hotkey">Esc</span> limpa a seleção.</div>` +
    (fields ? `<div class="sectionlabel">Editar em lote</div>${fields}` : "") +
    `<div class="sectionlabel">Selecionados · ${keys.length}</div>${rows}${more}` +
    `<div class="sectionlabel">Ações</div><div class="rowbtn"><button type="button" class="btn" data-clear-selection>Limpar seleção</button><button class="btn danger" id="deleteButton">✕ Excluir ${keys.length} elementos</button></div>`
  );
}

function applyBatch(fieldId: string, value: string): void {
  const f = BATCH_FIELDS.find((x) => x.id === fieldId);
  if (!f || !value) return;
  const keys = selectedNodeKeys();
  const targets = keys.filter((k) => f.appliesTo(keyKind(k)) && getByKey(k));
  const changed = targets.filter((k) => String(getByKey(k)?.[f.field] ?? "") !== value);
  if (!changed.length) return;
  change(() => {
    for (const k of changed) (getByKey(k) as AnyEntity)[f.field] = value;
  });
  const untouched = keys.length - targets.length;
  notify(
    `${f.label} “${value}” em ${changed.length} ${changed.length === 1 ? "elemento" : "elementos"}` +
      (untouched ? ` · ${untouched} sem esse campo ficaram como estavam` : ""),
  );
}

function kindSummary(keys: NodeKey[]): string {
  const counts = new Map<NodeKind, number>();
  for (const k of keys) counts.set(keyKind(k), (counts.get(keyKind(k)) || 0) + 1);
  return [...counts].map(([kind, n]) => `${PL[kind]} ${n}`).join(" · ");
}

const selectedEdgeId = (): string | undefined => (state.selected?.kind === "edge" ? state.selected.id : undefined);

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
  if (sel.kind === "nodes") {
    title.textContent = `${sel.ids.length} elementos selecionados`;
    sub.textContent = kindSummary(sel.ids);
    body.innerHTML = batchInspector(sel.ids);
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
  if (sel.kind !== "node") return;
  const k = sel.id;
  const o = getByKey(k);
  const t = keyKind(k);
  if (!o || String(o[path] ?? "") === value) return;
  change(() => {
    if (path === "lane") resetLaneLayouts();
    if (path === "format") rememberFormat(value);
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
        ws.graph.edges.push(edgeFor(ws, from, k, defaultEdgeName(ws, from, k), "Hipótese", "Inspetor"));
      }
    }
  });
}

/**
 * A raia de uma cena mudou: arranjos com raias ficam desatualizados e são refeitos
 * (o recorte atual é reorganizado já no re-render).
 */
function resetLaneLayouts(): void {
  const layouts = state.ws.graph.layouts;
  for (const key of Object.keys(layouts)) if (key.startsWith("lanes|")) delete layouts[key];
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
  if (sel?.kind !== "node") return;
  const question =
    which === "semantic"
      ? "Nome do novo tipo de elemento:"
      : which === "lane"
        ? "Nome da nova raia (quem age):"
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
    } else if (which === "lane") {
      // Nova raia entra antes de "Outros" (que fica sempre por último).
      const id = "lane-" + newId();
      const at = state.ws.lanes.findIndex((l) => l.id === DEFAULT_LANE);
      state.ws.lanes.splice(at < 0 ? state.ws.lanes.length : at, 0, { id, label: name });
      o.lane = id;
      resetLaneLayouts();
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
      // Bloco da gramática acompanha o rótulo (mostra/oculta "Usar rótulo sugerido").
      const g = body.querySelector(".grammar");
      if (o && g && path === "edge.label") g.outerHTML = grammarBlock(o as unknown as Edge);
    } else if (sel.kind === "node") {
      const o = getByKey(sel.id);
      if (o) o[path] = path === "questions" || path === "answers" ? v.split(/\r?\n/) : v;
      $("#inspectTitle").textContent = label(sel.id);
      const tools = body.querySelector(".note-tools");
      if (tools && keyKind(sel.id) === "note") tools.innerHTML = noteTools(o as unknown as NoteItem);
      if (path === "pain") body.querySelector<HTMLButtonElement>("[data-pain-hotspot]")!.disabled = !v.trim();
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
        x.value = colorForEdge(findEdge(selectedEdgeId()) || {});
        return;
      }
      setEdgeColor(color);
      return;
    }
    if (x.dataset.batch) {
      applyBatch(x.dataset.batch, x.value);
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
      const edge = findEdge(selectedEdgeId());
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
    const useLabel = el.closest<HTMLElement>("[data-use-label]");
    const edgeSel = findEdge(selectedEdgeId());
    if (useLabel && edgeSel) {
      change(() => {
        edgeSel.label = useLabel.dataset.useLabel as string;
      });
      return;
    }
    const exception = el.closest<HTMLElement>("[data-grammar-exception]");
    if (exception && edgeSel) {
      change(() => {
        edgeSel.grammarException = exception.dataset.grammarException === "on";
      });
      return;
    }
    const emo = el.closest<HTMLElement>("[data-emotion]");
    const nodeSel = selectedSingleNode() ?? "";
    if (emo && nodeSel && keyKind(nodeSel) === "scene") {
      const sc = getByKey(nodeSel) as Scene | undefined;
      const raw = emo.dataset.emotion as string;
      const val = raw === "" ? undefined : Number(raw);
      if (sc && sc.emotion !== val)
        change(() => {
          if (val === undefined) delete sc.emotion;
          else sc.emotion = val;
        });
      return;
    }
    if (el.closest("[data-pain-hotspot]") && nodeSel && keyKind(nodeSel) === "scene") {
      const sc = getByKey(nodeSel) as Scene | undefined;
      if (sc?.pain?.trim()) addHotspot({ target: nodeSel, name: sc.pain.trim() });
      return;
    }
    const openD = el.closest<HTMLElement>("[data-open-doc]");
    if (openD) return openDoc(openD.dataset.openDoc as string);
    const newD = el.closest<HTMLElement>("[data-new-doc]");
    if (newD) return newDoc(newD.dataset.newDoc as string);
    const noteAct = el.closest<HTMLElement>("[data-note-act]");
    if (noteAct && nodeSel && keyKind(nodeSel) === "note") {
      const n = getByKey(nodeSel) as unknown as NoteItem | undefined;
      const act = noteAct.dataset.noteAct;
      if (act === "copy") void copyNote(nodeSel);
      else if (act === "edit") startNoteEdit(nodeSel);
      else if (act === "pretty" && n) {
        const pretty = prettyJson(n.text);
        if (pretty && pretty !== n.text)
          change(() => {
            n.text = pretty;
          });
      }
      return;
    }
    const quick = el.closest<HTMLElement>("[data-quick]");
    if (quick) {
      quickCreate(quick.dataset.quick === "next" ? "next" : "sibling");
      return;
    }
    const only = el.closest<HTMLElement>("[data-select-only]");
    if (only) {
      selectNode(only.dataset.selectOnly as string);
      return;
    }
    if (el.closest("[data-clear-selection]")) {
      selectNodes([]);
      return;
    }
    if (el.id === "startLinkBtn" && nodeSel) beginConnect(nodeSel);
    if (el.id === "deleteButton") safeRemoveSelection();
    if (el.id === "duplicateButton") duplicateSelection();
    if (el.id === "focusItemBtn" && nodeSel) ensureVisible(nodeSel);
  });
}
