# ADR-001 — Runtime do servidor: Node.js 26 LTS

**Status:** Aceita. **Data:** 2026-11-13. **Decisor:** Tech Lead.

## Contexto

O Atlas passa a ter servidor: ele entrega a SPA, guarda os mapas em banco, autentica pela identidade corporativa e
audita os acessos. O padrão da empresa para serviço novo é NestJS com Fastify no Cloud Run, PostgreSQL, OpenTelemetry
com exportação configurável (ADR-0011) e o scaffold `/drc-cmd-arch-criar-microservico-nestjs`. O mapa de arquitetura
(`drc-mapa-arquitetura`) lista NestJS e Python no Cloud Run e não menciona Bun.

A carga do servidor é pequena: CRUD de documentos JSON e arquivos estáticos, num app interno. Os gargalos medidos no
assessment estão todos no navegador: render total via `innerHTML`, `layersLayout` O(S·E²), `first.includes` O(E·N),
`JSON.stringify` do workspace inteiro a cada `pointerdown`. O runtime do servidor não muda nenhum deles.

## Opções

| Critério                         | Node.js 26 LTS ("Lithium")                                                                                                     | Bun 1.4.4                                                                                                                                               |
|----------------------------------|--------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| Ciclo de suporte                 | LTS ativa desde 2026-10-28 (26.13.0), manutenção até 2029-04-30. A partir do 27, uma major por ano e toda versão vira LTS.       | Release mais recente: 2026-10-22. Não encontrei política de LTS publicada.                                                                               |
| Padrão da empresa                | NestJS + Fastify no Cloud Run, com scaffold e Golden Path.                                                                     | Fora do padrão documentado. Adotar exigiria ADR de exceção.                                                                                              |
| NestJS 12                        | Requisitos publicados em versão do Node: rodar exige ≥ 20.19 ou ≥ 22.12; o CLI, ≥ 22.22.3, ≥ 24.15 ou ≥ 26. Pacotes ESM-only.       | Os requisitos publicados do Nest 12 não falam em Bun. Rodaria pela camada de compatibilidade com Node, sem garantia do framework.                          |
| OpenTelemetry (ADR-0011)         | SDK Node com auto-instrumentação de primeira classe.                                                                           | Usa o mesmo SDK pela camada de compatibilidade. `Bun.serve` e o `fetch` nativo não são auto-instrumentados, e os guias desligam a instrumentação de `fs`.    |
| Governança                       | Projeto da OpenJS Foundation.                                                                                                  | MIT, código aberto no GitHub (`oven-sh/bun`), mas propriedade da Anthropic desde dez/2025, sem fundação nem órgão de governança separado.                  |
| Desempenho                       | Suficiente para a carga prevista.                                                                                              | Partida e throughput melhores nos benchmarks do fornecedor, que não medi aqui. A vantagem real seria o cold start no Cloud Run com `min-instances=0`.     |
| Ferramentas                      | npm, lockfile e `npm ci`, como o resto da empresa.                                                                             | Gerenciador de pacotes, bundler e test runner embutidos. Misturar com npm duplicaria o lockfile, contra `drc-guardrails-decisao`.                          |
| Time                             | Conhecimento existente: NestJS, Jest e Vitest.                                                                                 | Curva nova sem ganho mensurável neste produto.                                                                                                            |

## Decisão

**Node.js 26 LTS**, fixado em `engines.node: ">=26.13.0 <27"` e num `.node-version` com `26`. O Node local é v26.12.0
(conferido), anterior à promoção para LTS: atualize para 26.13 ou mais novo antes de iniciar o desenvolvimento do
servidor.

## Consequências

- O servidor segue o Golden Path da empresa (NestJS + Fastify, OTel, Cloud Run) e pode usar o scaffold oficial.
- A imagem base do Dockerfile é `node:26-*`, fixada por digest SHA.
- O cold start com `min-instances=0` será medido quando o serviço estiver publicado no Cloud Run. A primeira resposta,
  se ele incomodar, é `min-instances=1`, não trocar o runtime.

## Quando revisitar

- O Bun entra no Golden Path da empresa.
- O cold start medido no Cloud Run estoura um SLO acordado e `min-instances=1` é recusado por custo.
- O servidor deixa de ser NestJS (por exemplo, vira um servidor estático mínimo).

> **Nota de transparência:** a Anthropic, empresa que desenvolve o modelo que redigiu o texto-base deste ADR, é dona do
> Bun desde dez/2025. A recomendação vai no sentido contrário ao Bun e se apoia nos critérios da tabela, não nessa
> relação.

## Fontes

Consultadas em 2026-11-13. As do calendário são secundárias e citam o calendário oficial em
`github.com/nodejs/Release`, que é a referência a conferir antes de iniciar o servidor.

- Calendário do Node.js: [Node.js 26 Becomes LTS on 28 October 2026](https://www.vilvaathiban.com/blog/nodejs-26-lts-october-2026-which-node-version-to-use-new-release-schedule),
  [Node.js 26 LTS Adds a Modern Date API and Support to 2029](https://privatedevops.com/news/nodejs-26-lts),
  [Node.js Release and EOL Timeline](https://hidekazu-konishi.com/entry/nodejs_release_and_eol_timeline.html)
- Bun, versão e propriedade: [bun.com](https://bun.com/), [bun — npm](https://www.npmjs.com/package/bun),
  [Bun is joining Anthropic](https://bun.com/blog/bun-joins-anthropic), [Bun (software) — Wikipedia](https://en.wikipedia.org/wiki/Bun_(software))
- OpenTelemetry no Bun: [Datadog — Instrument Unsupported Runtimes](https://docs.datadoghq.com/opentelemetry/guide/instrument_unsupported_runtimes/),
  [SigNoz — Bun and ElysiaJS OpenTelemetry](https://signoz.io/docs/instrumentation/opentelemetry-bun/)
- NestJS 12 (Context7, `nestjs/docs.nestjs.com`): `content/migration.md` (requisitos de Node, pacotes ESM-only)
