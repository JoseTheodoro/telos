// Texto rico compartilhado: destaque de código (#10 notas livres) e Markdown (#10 e #21 caderno).
// Tudo embutido no build: funciona offline, em file://.
import DOMPurify from "dompurify";
import { Marked } from "marked";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import csharp from "highlight.js/lib/languages/csharp";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import http from "highlight.js/lib/languages/http";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { esc } from "./dom";

const LANGS = { bash, csharp, dockerfile, go, http, java, javascript, json, markdown, python, sql, typescript, xml, yaml };
for (const [name, def] of Object.entries(LANGS)) hljs.registerLanguage(name, def);
// Apelidos comuns em blocos ```lang do Markdown.
hljs.registerAliases(["sh", "shell", "zsh", "console"], { languageName: "bash" });
hljs.registerAliases(["js"], { languageName: "javascript" });
hljs.registerAliases(["ts"], { languageName: "typescript" });
hljs.registerAliases(["py"], { languageName: "python" });
hljs.registerAliases(["yml"], { languageName: "yaml" });
hljs.registerAliases(["html", "svg"], { languageName: "xml" });
hljs.registerAliases(["cs", "c#"], { languageName: "csharp" });
hljs.registerAliases(["postgres", "postgresql", "plsql", "tsql", "mysql"], { languageName: "sql" });

/** Formatos de uma nota livre (ordem do seletor). */
export const NOTE_FORMATS: { id: string; label: string; code: boolean }[] = [
  { id: "text", label: "Texto", code: false },
  { id: "markdown", label: "Markdown", code: false },
  { id: "json", label: "JSON", code: true },
  { id: "sql", label: "SQL", code: true },
  { id: "bash", label: "Bash / shell", code: true },
  { id: "javascript", label: "JavaScript", code: true },
  { id: "typescript", label: "TypeScript", code: true },
  { id: "python", label: "Python", code: true },
  { id: "java", label: "Java", code: true },
  { id: "csharp", label: "C#", code: true },
  { id: "go", label: "Go", code: true },
  { id: "yaml", label: "YAML", code: true },
  { id: "xml", label: "XML / HTML", code: true },
  { id: "http", label: "HTTP (requisição)", code: true },
  { id: "dockerfile", label: "Dockerfile", code: true },
];

export const formatLabel = (id: string): string => NOTE_FORMATS.find((f) => f.id === id)?.label ?? id;
export const isCodeFormat = (id: string): boolean => !!NOTE_FORMATS.find((f) => f.id === id)?.code;

/** HTML destacado (já escapado pelo highlight.js); linguagem desconhecida → texto escapado. */
export function highlight(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } catch {
      /* cai no texto puro */
    }
  }
  return esc(code);
}

/** JSON válido? Devolve a mensagem de erro (para o aviso discreto na nota). */
export function jsonError(text: string): string | null {
  if (!text.trim()) return null;
  try {
    JSON.parse(text);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Reindenta JSON válido com 2 espaços (null se inválido). */
export function prettyJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }) {
      const language = (lang || "").trim().split(/\s+/)[0].toLowerCase();
      const known = !!language && !!hljs.getLanguage(language);
      return `<pre class="md-code"${language ? ` data-lang="${esc(language)}"` : ""}><code class="hljs${known ? " language-" + esc(language) : ""}">${highlight(text, known ? language : "")}</code></pre>`;
    },
  },
});

// Links do Markdown abrem fora do Telos (sem acesso à janela de origem).
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.getAttribute("href")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

const cache = new Map<string, string>();

/**
 * Markdown → HTML sanitizado. O conteúdo pode vir de um JSON importado de outra pessoa,
 * por isso todo HTML gerado passa pelo DOMPurify (sem scripts, eventos ou iframes).
 */
export function renderMarkdown(src: string): string {
  const hit = cache.get(src);
  if (hit !== undefined) return hit;
  const html = DOMPurify.sanitize(md.parse(src, { async: false }) as string, {
    ADD_ATTR: ["target"],
    // <input> fica: são os checkboxes de tarefa (- [ ]) do Markdown.
    FORBID_TAGS: ["style", "form", "button", "textarea", "select"],
  });
  if (cache.size > 300) cache.clear();
  cache.set(src, html);
  return html;
}

/** Conteúdo de uma nota livre já pronto para o card. */
export function renderNoteBody(text: string, format: string): string {
  if (!text.trim()) return `<p class="note-placeholder">Duplo clique para escrever…</p>`;
  if (format === "markdown") return `<div class="md">${renderMarkdown(text)}</div>`;
  if (isCodeFormat(format)) return `<pre class="note-code"><code class="hljs">${highlight(text, format)}</code></pre>`;
  return `<div class="note-text">${esc(text)}</div>`;
}

/** Copia texto para a área de transferência (com alternativa para file:// sem permissão). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
