# ADR-003 — Persistência: documento JSONB versionado com travamento otimista

**Status:** A revisar. Aceita em 2026-11-13 pelo Tech Lead.

**Por que revisar:** O Cloud SQL era o padrão corporativo; o modelo de documento versionado e a visão fora do documento continuam valendo.

## Decisão

- **Banco:** Cloud SQL PostgreSQL 18, padrão da empresa para serviço novo. A instância e o tier do serviço, que definem
  HA `REGIONAL` e a cadência de restore, ainda serão definidos.
- **Modelo:** cada mapa é uma linha de `workspaces` com o documento inteiro em `document jsonb` e uma coluna
  `version integer`. O cliente já opera sobre o documento inteiro (undo por snapshot, export, import), e normalizar
  seria uma reescrita sem evidência de necessidade.
- **Concorrência:** travamento otimista por documento. `GET` devolve `ETag: "<version>"`; `PUT` exige `If-Match`
  (428 se faltar) e grava com `UPDATE … WHERE id = $1 AND version = $2 RETURNING version`. Se nenhuma linha mudar, a
  resposta é 409 com a versão atual.
- **Fora do documento:** `view` (câmera, foco, aba, modo do caderno) é estado por usuário e fica no `localStorage`, numa
  chave por workspace. O servidor remove `view` antes de gravar.
- **Sem coedição em tempo real** nesta fase: duas pessoas editando o mesmo mapa ao mesmo tempo recebem conflito
  explícito. Edição granular (patches por comando, CRDT) fica fora de escopo; uma refatoração futura do cliente para
  operar por comandos prepara o terreno.

## Esquema inicial (migrations TypeORM com `up` e `down`)

| Tabela              | Colunas                                                                                                                                                                                  | Observação                                                                                         |
|---------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| `users`             | `id uuid pk default gen_random_uuid()`, `idp_subject text unique not null`, `display_name text not null`, `created_at timestamptz`                                                         | Sem e-mail nem CPF: o `idp_subject` basta para autorizar. `display_name` é PII mínima.               |
| `workspaces`        | `id uuid pk`, `title text not null`, `document jsonb not null`, `schema text not null`, `version integer not null default 1`, `created_by uuid fk`, `updated_by uuid fk`, `created_at timestamptz`, `updated_at timestamptz`, `deleted_at timestamptz null` | Soft delete. Timestamps em UTC (`timezone: 'Z'` na conexão).                                         |
| `workspace_members` | `workspace_id uuid fk`, `user_id uuid fk`, `role text check (role in ('owner','editor','viewer'))`, PK `(workspace_id, user_id)`                                                          | Quem cria vira `owner`.                                                                             |
| `audit_events`      | `id uuid pk`, `occurred_at timestamptz`, `actor_user_id uuid`, `workspace_id uuid null`, `action text`, `outcome text`, `correlation_id text`                                              | Nunca guarda conteúdo do documento.                                                                  |
| `idempotency_keys`  | `key text`, `user_id uuid`, `request_hash text`, `response_status int`, `response_body jsonb`, `created_at timestamptz`, PK `(user_id, key)`                                               | Retenção de 24 h.                                                                                    |

Toda escrita que toca `workspaces` e `audit_events` roda numa transação só (`drc-guardrails-banco`). O conteúdo dos
mapas é material de oficina com persona sintética. Mesmo assim, campos de texto livre (`notes`, `story`, `pain`, caderno)
podem receber dado sensível por engano. Por isso: o conteúdo nunca vai para log, o acesso é auditado, a criptografia
em repouso fica no nível do Cloud SQL, e a classificação dos dados e a retenção serão definidas com o DPO.
