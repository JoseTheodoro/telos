# PEP Atlas Studio v2.0 — Terminal local e integração agentic

**Status:** proposta de arquitetura, **não implementada** na versão v1.5.

## Resposta à dúvida

Sim: é viável abrir um terminal integrado, executar `claude` (Claude Code instalado e autorizado localmente) e transformar pesquisas do agente em jornadas, caixas, relações e setas **em tempo real**.

Não é seguro nem tecnicamente suficiente colocar `exec('claude')` em um arquivo HTML aberto diretamente no navegador. É necessário um **processo local confiável** (desktop app ou servidor localhost) para controlar o subprocesso, permissões, terminal e persistência.

## Topologia proposta

```text
┌──────────────────────────────────────┐
│ PEP Atlas Studio (UI)                │
│ Canvas SVG + Inspetor + xterm.js     │
│       ▲                  │           │
│       │ diffs/patches     │ comandos  │
└───────┼───────────────────┼───────────┘
        │                   ▼
┌───────┴───────────────────────────────┐
│ Atlas Local Host                     │
│ - WebSocket / PTY (Go ou Rust)       │
│ - Graph API / validação do schema    │
│ - SQLite / JSON versionado           │
│ - Approval / audit log               │
└───────┬───────────────────────────────┘
        │
        ├── Claude Code CLI (modo interativo em PTY)
        │
        ├── Claude Agent SDK / `claude -p` para patches estruturados
        │
        └── Atlas MCP Server (ferramentas com permissões)
                ├── atlas.list_nodes
                ├── atlas.add_node
                ├── atlas.connect_nodes
                ├── atlas.preview_patch
                └── atlas.apply_patch (confirmação humana)
```

### Duas formas de integração

1. **Terminal real**: um botão abre um painel xterm.js; o serviço local cria um PTY e conecta a sessão do Claude Code. O usuário conversa com o CLI normalmente. Isso por si só não altera o canvas.
2. **IA que edita o grafo**: Claude recebe ferramentas MCP ou produz operações estruturadas em JSON, validadas no backend. A interface mostra prévia (caixas a criar, setas, alterações e possíveis exclusões), pede aprovação e aplica o lote de maneira transacional. Essa é a parte que transforma pesquisa em diagrama.

## Protocolo proposto — Atlas Patch v1

Formato **proposto**, ainda não implementado. Não confundir com o JSON de backup da v1.5.

```json
{
  "schema": "atlas-patch-v1",
  "operations": [
    {
      "op": "createNode",
      "clientId": "state-1",
      "kind": "semantic",
      "semanticType": "Estado",
      "name": "Exame aguardando laudo"
    },
    {
      "op": "createNode",
      "clientId": "action-1",
      "kind": "semantic",
      "semanticType": "Ação",
      "name": "Validar laudo"
    },
    {
      "op": "createEdge",
      "from": "action-1",
      "to": "state-1",
      "label": "altera estado",
      "status": "Hipótese",
      "color": "#337fc6"
    }
  ]
}
```

O backend deve atribuir IDs definitivos, validar referências e restrições e executar o lote somente após aprovação. O agente pode incluir `source`, `evidence`, `confidence` e `reviewStatus` em cada operação.

## Design de segurança

- Apenas `localhost` ou aplicativo desktop nativo; limitar os processos que o host pode iniciar.
- Não transformar respostas da IA em JavaScript executável, SQL gravável ou comandos shell arbitrários.
- Consultas a sistemas legados e bancos, inicialmente, **somente leitura e com credenciais de escopo mínimo**. Se houver dados clínicos reais, controlar PII/PHI, auditoria, retenção e envio a provedores externos.
- Todo patch deve ter diff, revisão de schema, limite de tamanho, validação de relacionamento e aprovação explícita antes de aplicar.
- Evitar misturar evidências do legado com inferências do agente: todo vínculo deve preservar o estado `Hipótese`, `Em investigação` ou `Validado` e a proveniência.
- Versionar em SQLite + snapshots JSON no primeiro MVP; usar histórico auditável e backups; oferecer rollback.

## Stack recomendada

- **Interface**: preservar o HTML/JS do Atlas; no shell desktop, usar Tauri 2; usar xterm.js para terminal.
- **Host**: serviço local Go para APIs, WebSocket e PTY, invocado e supervisionado pelo desktop. Alternativa: backend Rust nativo do Tauri.
- **Claude**: terminal interativo por PTY para conversa; integração estruturada via Agent SDK TypeScript/Python ou CLI `claude -p` processado pelo host.
- **Atlas MCP**: server MCP com as ações tipadas do grafo; idealmente não disponibilizar `apply_patch` sem aprovação.
- **Persistência**: SQLite no computador + export/import JSON versionado; não depender apenas de `localStorage`.

## Incrementos sugeridos

**V2.0a:** empacotar o Atlas como aplicação local; persistir SQLite; terminal xterm.js com processo PTY controlado.

**V2.0b:** contrato `atlas-patch-v1` + validador, preview de alterações, aplicação atômica e desfazer.

**V2.0c:** Atlas MCP + ferramentas para o Claude; perguntas guiadas, pesquisa de esquema legado em modo somente leitura e criação assistida de jornadas/caixas/setas.

## Recursos técnicos oficiais consultados

- Anthropic, Claude Agent SDK: https://code.claude.com/docs/en/agent-sdk/overview
- Anthropic, execução CLI programática: https://code.claude.com/docs/en/headless
- Tauri 2, plugin shell: https://v2.tauri.app/reference/javascript/shell/
