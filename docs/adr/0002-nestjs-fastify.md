# ADR-002 — Framework: NestJS 12 sobre Fastify 5

**Status:** A revisar. Aceita em 2026-11-13 pelo Tech Lead.

**Por que revisar:** O NestJS foi escolhido porque um guardrail corporativo o exigia; para a Telos, Fastify puro volta a ser opção.

- **Decisão:** NestJS 12 com `FastifyAdapter` (Fastify 5), projeto ESM (`"type": "module"`, `module`/`moduleResolution`
  `nodenext`). Estrutura Controller → Service → Repository → Entity/DTO. DTOs com `class-validator`, Swagger fora de
  produção, guard global com `@Public()` explícito, `GlobalExceptionFilter`, TypeORM.
- **Alternativa considerada:** Fastify puro, mais leve e alinhado ao "evitar abstrações desnecessárias" do
  `AGENTS.md`. Descartada porque `drc-guardrails-arquitetura` exige NestJS em serviço novo; usar Fastify puro pediria
  exceção sem ganho que a justifique.
- **Test runner:** Vitest nos três pacotes (web, domínio e servidor), decidido em 2026-11-13. O template ESM do Nest 12
  usa Vitest por padrão, e o web precisa de Vitest ≥ 4.1 por causa do Vite 8. O guardrail cita Jest; com Jest, o
  Nest 12 exige Node ≥ 24.9 para carregar os pacotes ESM, o que o Node 26 atende, então Jest seria viável, mas
  obrigaria a manter dois runners.
- **Verificação obrigatória antes de instalar:** confirmar no Context7 as versões e APIs de `@nestjs/*`,
  `@nestjs/platform-fastify`, `@fastify/helmet`, `@fastify/static` (ou `@nestjs/serve-static`), `typeorm`, `pg`,
  `@opentelemetry/sdk-node` e `nestjs-pino`/`pino`, conforme a regra de conferir versão e documentação atual antes de
  adicionar dependência (`drc-guardrails-decisao`).

## Fontes

Consultadas em 2026-11-13.

- NestJS 12 (Context7, `nestjs/docs.nestjs.com`): `content/migration.md` (Jest com Node ≥ 24.9, Vitest no template
  ESM) e `content/recipes/fastify-migration.md` (Fastify 5)
- Vitest e Vite 8: [Vitest 4.1 is out!](https://vitest.dev/blog/vitest-4-1.html)
