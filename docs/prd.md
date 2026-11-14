# Telos — PRD

**Status:** aprovado para execução. **Data:** 2026-11-14. **Substitui:** `docs/archive/plan-atlas-servidor.md`.

## Decisões que orientam este documento

| Tema           | Decisão                                                                                                   |
|:---------------|:----------------------------------------------------------------------------------------------------------|
| Foco           | Entender os eventos e os estados de cada domínio na migração de um software legado de 15 anos.            |
| Nível          | O MVP atende o Big Picture. O Process Modelling vem depois; o Software Design fica fora do roteiro.       |
| Sessão         | Modo escriba: o facilitador opera o Telos e compartilha a tela; a sala dita. Sem multiplayer no MVP.      |
| Modelo         | Canvas-first canônico: o post-it é o objeto central e a estrutura nasce na sessão.                        |
| Unidade        | Um canvas por domínio, mais um canvas "Big Picture" do legado inteiro.                                    |
| Idioma         | Interface em pt-BR. Os termos do Event Storming e os identificadores do schema ficam em inglês.           |
| Plataforma     | Navegadores desktop evergreen a partir de 1024px.                                                         |
| Persistência   | Local-first, em `localStorage`, atrás de uma porta (`BoardStore`) que depois recebe o servidor.           |
| Tipografia     | Inter na UI e nos post-its; JetBrains Mono só em código e atalhos.                                        |
| Legado         | O app do Atlas é substituído, e não removido aos poucos. Nada do modelo narrativo ou clínico continua.    |
| Dados          | Ruptura limpa: schema `telos/v1`, sem importador do Atlas.                                                |
| Governança     | Os guardrails corporativos do plano anterior não valem. As ADRs 0001–0003 estão "A revisar".              |

---

## 1. Visão geral estratégica

### 1.1 Visão

Quem migra um sistema legado entende, antes de escrever código novo, quais fatos o negócio produz e por quais estados
cada coisa passa.

### 1.2 Missão

Dar ao engenheiro que facilita a sessão uma parede de Event Storming que segue o método e não exige configuração: em
minutos, a sala sai do primeiro Domain Event para o ciclo de vida de cada Aggregate do domínio que está migrando.

### 1.3 Proposta de valor

- **Para** engenheiros que conduzem a descoberta de domínio numa migração de legado, com especialistas do negócio
  na sala ou na chamada.
- **Quadros genéricos** (FigJam, Miro) pedem que o facilitador monte o kit do zero a cada sessão. Eles não sabem o que
  é um Domain Event, um Hotspot ou um Aggregate, e o que a sala descobre fica em post-its soltos.
- **O Atlas**, a versão anterior deste código, impunha Jornada → Capítulo → Cena antes da descoberta, falava a língua
  de um único vertical e enchia a tela de controles.
- **O Telos** abre numa tela quase vazia, com os post-its do Big Picture a uma tecla de distância. Cada post-it guarda
  de onde o fato vem no legado. Ao selecionar um Aggregate, o Telos mostra o ciclo de vida dele, montado a partir dos
  Domain Events que a sala já colocou na parede.

### Personas

| Persona                                  | Papel na sessão                          | O que precisa                                                        |
|:-----------------------------------------|:-----------------------------------------|:---------------------------------------------------------------------|
| Engenheiro(a) facilitador(a) — primária  | Opera o Telos e compartilha a tela       | Criar e mover post-its pelo teclado sem perder o ritmo da conversa; exportar o resultado. |
| Especialista do domínio/legado — secundária | Lê a tela compartilhada e dita        | Ler qualquer post-it na chamada, sem precisar operar nada.           |

Quando as duas personas puxarem para lados opostos, a primária ganha.

### Princípios de produto

1. **Menos é mais.** Cada controle permanente precisa justificar o espaço que ocupa; o resto aparece no contexto.
2. **Entrega vertical.** Cada fatia vai da UI à persistência, com teste, e pode ir para produção sozinha.
3. **O método guia sem bloquear.** Sugestões e avisos, nunca proibições.
4. **Teclado primeiro.** Tudo o que se faz várias vezes por minuto tem atalho.
5. **Acessível.** Contraste AA, foco visível e navegação por teclado.
6. **Uma fonte por informação.** O que pode ser derivado da parede (ordem, ciclo de vida) não é digitado de novo.

### Vocabulário

A interface é em pt-BR. Os termos do método ficam em inglês, como a comunidade de Event Storming os usa:

| Termo           | Em pt-BR, para o glossário                                  |
|:----------------|:------------------------------------------------------------|
| Domain Event    | Fato relevante para o negócio, escrito no passado           |
| Hotspot         | Dúvida, risco ou conflito em aberto                         |
| Actor           | Pessoa ou papel que age                                     |
| External System | Sistema fora do domínio que participa do fluxo              |
| Aggregate       | Coisa do negócio que guarda estado e muda com os eventos    |
| Command         | Intenção: o que alguém pede ao sistema                      |
| Policy          | Reação: "sempre que X, então Y"                             |
| Read Model      | Informação que apoia uma decisão                            |
| Pivotal Event   | Evento depois do qual a história muda de assunto            |
| Swimlane        | Faixa horizontal que separa fluxos paralelos                |
| Big Picture     | Visão do processo inteiro, de ponta a ponta                 |

A interface chama o objeto de trabalho de **canvas** ("Novo canvas", "Renomear", "Exportar"). O schema usa
identificadores em inglês (`domainEvent`, `hotspot`, `aggregate`…).

---

## 2. Objetivos

### 2.1 Contexto

O Atlas nasceu numa oficina de Event Storming de saúde e cresceu por acréscimo (v1.5, v1.6). Hoje ele tem cerca de
9,2 mil linhas de TypeScript e CSS, 26 roteiros e2e, um pacote de domínio puro (`packages/domain`) e um servidor
NestJS que entrega a SPA com CSP restrita.

A maior parte da UI depende do modelo narrativo (`render.ts`, `inspector.ts`, `sidebar.ts`, `quick-create.ts`,
`timeline.ts`, `visibility.ts`) e sai com ele. O que é genérico e vale reaproveitar:

| Ativo                                   | Onde                                                     |
|:----------------------------------------|:---------------------------------------------------------|
| Câmera, pan e zoom                      | `src/canvas/camera.ts`                                   |
| Seleção, laço, arraste, snap e guias    | `src/canvas/interactions.ts`, `guides.ts`, `align.ts`    |
| Undo/redo por snapshot                  | `src/core/history.ts`                                    |
| Cores canônicas dos post-its            | `packages/domain/src/es.ts`                              |
| Gramática das setas (para o P2)         | `packages/domain/src/grammar.ts`                         |
| Validação do documento                  | `packages/domain/src/validate.ts`                        |
| Fonte auto-hospedada, cache e CSP       | `src/assets/fonts`, `server/src/Infrastructure/Http`     |

### 2.2 Problema

1. **A estrutura chega cedo demais.** Jornada, Capítulo e Cena precisam existir antes do primeiro evento, o que vai
   contra a fase de exploração do Big Picture. No Event Storming, a estrutura (Pivotal Events, Swimlanes) emerge da
   parede, não a precede.
2. **O estado fica invisível.** Numa migração, a pergunta central é "por quais estados um pedido passa, e o que o
   legado faz em cada um?". Hoje a resposta está espalhada em post-its sem vínculo.
3. **O vínculo com o legado é pesado ou não existe.** O Atlas tinha um catálogo estruturado de Sistema, Tela e Tabela,
   caro de manter durante a sessão. Sem ele, não sobra onde anotar "isso vive na `PED_STATUS`".
4. **A tela está poluída.** Cerca de 30 controles permanentes: header com 7 botões, sidebar com 3 abas, 3 filtros, uma
   barra com 17 ferramentas, faixa de ajuda, legenda e rodapé. Numa tela compartilhada, isso é ruído para quem só lê.
5. **O domínio está acoplado a um vertical.** Natureza "Clínico", destino "Prontuário / PEP", raias "Enfermagem" e
   "Médico", mais de 60 tipos semânticos.
6. **Só existe um canvas.** Não dá para separar os domínios do legado.
7. **A tipografia não ajuda.** Tudo em monoespaçada de 9 a 13px, ilegível em zoom baixo e numa chamada de vídeo.

### Metas

| Meta                                        | Alvo                                          | Como verificar                                   |
|:--------------------------------------------|:----------------------------------------------|:-------------------------------------------------|
| Primeiro post-it                            | ≤ 5 s depois de abrir um canvas novo          | Observação em sessão real                        |
| Criar um canvas                             | ≤ 2 interações a partir da home               | e2e                                              |
| Controles visíveis no estado inicial        | ≤ 8                                           | e2e (conta os controles visíveis)                |
| Legibilidade na tela compartilhada          | Post-it legível em 1080p com zoom de 50%      | Observação em sessão real                        |
| Contraste de texto                          | AA (4,5:1) em todo texto                      | Teste automatizado dos pares de tokens           |
| Qualidade a cada fatia                      | `npm run check` e e2e verdes                  | Gate de cada fatia                               |

O MVP não tem telemetria de produto.

---

## 3. Funcionalidades

Fatias verticais, em ordem de entrega. Cada FN acrescenta ao modelo `telos/v1` só o que ela usa.

### Esqueleto (P0): FN-01, FN-02 e FN-03

As três saem juntas: é a primeira entrega usável de ponta a ponta.

#### FN-01-novo-canvas

**Objetivo:** um canvas por domínio do legado, e começar um novo em segundos.

**Critérios de aceite**
- A home lista os canvas por última edição, com nome e data.
- "Novo canvas" cria um canvas em branco e o abre com foco na parede.
- O nome edita inline no topo do canvas e na home.
- Duplicar e apagar (com confirmação) pela home.
- Reabrir o app abre o último canvas usado.
- Trocar de canvas reinicia o histórico de desfazer.

**Fora:** pastas, busca, templates, links entre canvas.

#### FN-02-post-its-do-big-picture

**Objetivo:** escrever na parede sem pensar na ferramenta.

**Critérios de aceite**
- Cinco tipos, com as cores de `es.ts`: `1` Domain Event, `2` Hotspot, `3` Actor, `4` External System, `5` Aggregate.
- As teclas `1`–`5` criam no cursor quando nenhum texto está em edição; duplo clique no fundo cria um Domain Event.
- O texto edita inline ao criar e a altura cresce com o conteúdo.
- Com um post-it selecionado, as mesmas teclas trocam o tipo dele.
- Todo post-it tem o campo opcional **Origem no legado** (texto livre: tabela, tela, procedure, módulo), editado no
  painel contextual.

**Fora:** Command, Policy e Read Model (chegam com a FN-09); formatação rica, imagens e votos.

#### FN-03-parede-infinita

**Objetivo:** mover-se e organizar a parede como no FigJam.

**Critérios de aceite**
- Roda ou trackpad move; `Ctrl/⌘` + roda ou pinça dá zoom ancorado no cursor.
- Clique, `Shift` + clique e laço selecionam; arrastar move com snap e guias; `Alt` desliga o snap.
- Desfazer e refazer cobrem toda edição do canvas aberto.
- `Delete` remove a seleção e `⌘D` duplica.

**Reaproveita:** `camera.ts`, `interactions.ts`, `guides.ts`, `align.ts` e `history.ts`.

### P1

#### FN-04-exportar-e-importar-json

**Por que é P1:** no local-first, o trabalho da sessão existe só naquele navegador. Limpar os dados do site ou trocar
de máquina apaga tudo.

**Critérios de aceite**
- Exportar o canvas aberto como JSON `telos/v1`.
- Importar um JSON `telos/v1` como um canvas novo; um arquivo inválido mostra o motivo e não altera nada.

#### FN-05-hotspots

**Objetivo:** não perder nenhuma dúvida levantada pela sala.

**Critérios de aceite**
- O Hotspot aparece como post-it vermelho inclinado.
- Ele tem dois estados: aberto e resolvido. O resolvido fica esmaecido.
- Um contador discreto mostra os hotspots abertos; ao clicar, a câmera percorre cada um deles.

**Fora:** prioridade, responsável, campo de resolução. A resposta vai no texto ou em Origem no legado.

#### FN-06-ciclo-de-vida-do-aggregate

**Objetivo:** ver por quais estados um Aggregate passa, sem desenhar a máquina de estados.

**Critérios de aceite**
- Uma seta liga um Aggregate a um Domain Event. É o conector mínimo: sem rótulo, sem cor, sem escolha de lado.
- Ao selecionar um Aggregate, o painel contextual lista os Domain Events ligados a ele, ordenados pela posição
  horizontal na parede (da esquerda para a direita), com a Origem no legado de cada um.
- Mover um evento na parede reordena o ciclo de vida.
- Um evento ligado a dois Aggregates aparece no ciclo de vida dos dois.
- O ciclo de vida é sempre calculado e nunca é salvo no documento.

#### FN-07-pivotal-events

**Objetivo:** apoiar a fase "enforce the timeline".

**Critérios de aceite**
- Marcar um Domain Event como Pivotal Event desenha uma linha vertical rotulada com o nome do evento.
- A linha fica atrás dos post-its e não é selecionada por engano.
- Desmarcar remove a linha.

#### FN-08-swimlanes

**Objetivo:** separar fluxos paralelos quando a sala sentir necessidade.

**Critérios de aceite**
- Criar uma Swimlane horizontal com nome; redimensionar e reordenar.
- Os post-its não pertencem à Swimlane: ela é só uma faixa visual.

**Fora:** catálogo fixo de raias e inferência pelo texto.

### P2

- **FN-09-process-modelling:** Command, Policy e Read Model (teclas `6`–`8`), com rótulos sugeridos pela gramática
  Actor → Command → Aggregate → Domain Event → Policy → Command, reaproveitando `grammar.ts`. Uma ligação fora da
  gramática mostra o post-it que costuma ficar no meio, sem bloquear.
- **FN-10-molduras:** seções nomeadas na parede. Com um canvas por domínio, elas deixam de ser essenciais.
- **FN-11-exportar-imagem:** SVG e PNG da parede.
- **FN-12-dica-de-verbo-no-passado:** sugere passar para o passado um Domain Event escrito no infinitivo. Só entra
  com testes de falso positivo em pt-BR ("Lugar reservado" não pode disparar a dica).

### Fora de escopo agora

Multiplayer e coedição (a próxima grande aposta depois do MVP), servidor e sync, autenticação, templates, IA,
comentários, timer de facilitação, links entre canvas, consultas sobre o legado ("quais eventos tocam a tabela X?") e
suporte garantido a tablet e celular.

---

## 4. Fundação

A fundação não é uma fase antes das FNs: cada FD entra na fatia que precisa dela, e só na medida dessa fatia.

- **DRY:** uma única fonte para cores, tipos e tokens; o que é derivável não é salvo.
- **YAGNI:** sai o que nenhuma FN pede, e o modelo cresce com as FNs.
- **KISS:** a solução mais simples que atende a FN da vez.

| FD    | Quando entra                              |
|:------|:------------------------------------------|
| FD-01 | Feito                                     |
| FD-02 | Esqueleto; cresce com cada FN             |
| FD-03 | Esqueleto                                 |
| FD-04 | Esqueleto; cresce com cada FN             |
| FD-05 | Esqueleto                                 |
| FD-06 | Esqueleto; o painel cresce com cada FN    |
| FD-07 | Fecha o esqueleto                         |

### FD-01-identidade-telos

**Situação:** feito em 2026-11-14.

**O que entrou:**
- Pacotes `telos`, `@telos/domain` e `@telos/server`, e a condição de export `telos-source`.
- Título, marca, README, glossário, ADRs, nomes de arquivos exportados e infra (Docker, OTel).

**O que ficou:** os identificadores de dados `pep-atlas-studio-v3/v4` e `pep-discovery-atlas-v1`, que saem junto com o
app antigo (FD-07).

### FD-02-modelo-telos-v1

**Por quê:** o modelo atual gira em torno da narrativa e de um vertical de saúde. O Telos gira em torno do post-it.

**Entra no esqueleto:**
- Um `Board` com `schema: "telos/v1"`, `id`, `title` e `stickies`.
- Cada sticky tem `id`, `kind` (`domainEvent`, `hotspot`, `actor`, `externalSystem`, `aggregate`), `text`, `x`, `y`,
  `w`, `h` e `legacySource` opcional.
- `parseBoard` valida o documento: números finitos, `kind` conhecido e textos como string.
- `es.ts` passa a trabalhar com `kind` direto, sem `semanticType`.

**Cresce depois, na FN que pede:** `connectors` (FN-06), o estado do hotspot (FN-05), `pivotal` no sticky (FN-07),
`lanes` (FN-08), os tipos de Process Modelling (FN-09) e `frames` (FN-10).

**Fica fora:** importador do Atlas, `semanticType`, natureza, destino e hierarquia narrativa.

**Pronto quando:** testes de domínio cobrem a criação, a validação (incluindo os payloads do `xss.mjs`) e o
round-trip de `telos/v1`.

### FD-03-armazenamento-multi-canvas

**Por quê:** a FN-01 precisa de vários canvas, e o servidor vai entrar depois sem reescrever o cliente.

**Entra:**
- A porta `BoardStore` com `list`, `get`, `create`, `save` e `remove`.
- `LocalBoardStore` em `localStorage`: um índice (`id`, `title`, `updatedAt`) e uma chave por canvas.
- O aviso de cota que já existe em `persistence.ts`.
- O estado de visão (câmera por canvas e último canvas aberto) em chave própria, fora do documento.
- `persist()` continua síncrona para quem chama.

**Fica fora:** IndexedDB, que só entra se um canvas real passar de 4 MB; `HttpBoardStore`, sync, outbox e conflitos.

**Pronto quando:** dois canvas são criados, editados e reabertos sem um vazar no outro; mover a câmera não altera o
documento.

### FD-04-design-tokens

**Por quê:** hoje as cores estão espalhadas e duplicadas. Um sistema limpo precisa de uma fonte única.

**Entra:**
- `src/styles/tokens.css` com custom properties de superfície e tinta, espaço em escala de 4/8px, raio, sombra,
  z-index e motion.
- As cores dos post-its vêm de `ES_STYLES` (`es.ts`), sem cópia no CSS.
- O código novo não tem hex soltos nem `!important`.
- Um teste confere o contraste AA de cada par texto/fundo dos tokens.

**Fica fora:** tema escuro e temas por cliente.

### FD-05-tipografia

**Por quê:** a monoespaçada de 9 a 13px não se lê em zoom baixo nem numa chamada de vídeo.

**Entra:**
- Inter auto-hospedada (OFL, woff2, pesos 400, 500 e 600), por causa da CSP `font-src 'self'`.
- Escala tipográfica em tokens: 12, 14, 16, 20 e 24px, com altura de linha definida.
- JetBrains Mono só em atalhos e na Origem no legado, nos pesos 400 e 500. Os outros pesos saem.

**Fica fora:** escolha de fonte pelo usuário.

**Pronto quando:** o e2e `self-hosted-font` cobre a Inter, e o post-it é legível em 1080p com zoom de 50%.

### FD-06-shell-minimo

**Por quê:** "pouca coisa na tela, livre para desenho". Numa tela compartilhada, cada controle é ruído para quem só lê.

**Entra:**
- **Home:** a lista de canvas e "Novo canvas".
- **Barra superior mínima:** voltar à home, nome do canvas e um menu "…". O menu guarda desfazer, refazer, zoom
  (100%, enquadrar) e ajuda; os atalhos de teclado continuam valendo.
- **Toolbar flutuante inferior:** um botão por post-it disponível. Não há ferramenta de seleção, porque o ponteiro é o
  modo padrão e `Esc` volta a ele.
- **Painel contextual:** aparece só com seleção, fica perto dela e mostra a Origem no legado e, depois, o ciclo de
  vida.
- A ajuda abre com `?` ou pelo menu e lista os atalhos e a legenda de cores.
- No esqueleto, a conta fecha em 8: home, nome, menu e os 5 post-its.

**Pronto quando:** o estado inicial tem no máximo 8 controles visíveis; tudo é acessível por teclado, com `aria-label`
em cada botão de ícone.

### FD-07-substituicao-do-atlas

**Por quê:** quase toda a UI atual depende do modelo velho. Remover feature por feature seria trabalho jogado fora.

**Entra:**
- O esqueleto nasce num módulo novo sobre `telos/v1`, reaproveitando `camera`, `interactions`, `guides`, `align` e
  `history`, adaptados ao modelo novo.
- O app antigo continua funcionando até a troca.
- Quando os e2e do esqueleto ficarem verdes, um único commit apaga o app antigo:
  - a UI e o modelo narrativo e clínico, com os e2e deles;
  - os identificadores `pep-atlas-*`;
  - as notas livres com `marked`, `highlight.js` e `dompurify`;
  - o build portátil, o `vite-plugin-singlefile` e o e2e contra `file://`.
- O glossário é reescrito para o vocabulário da seção 1.
- O `docker-compose.yml` perde o Postgres, que nada usa.

**Fica:** o servidor NestJS como está (SPA, cache, CSP e `/health`) e o Dockerfile. Os e2e que valem para o Telos
(`xss`, `self-hosted-font`, `render-guard`) são reescritos sobre o modelo novo.

**Pronto quando:** `git grep -i -e atlas -e pep-` só encontra documentos históricos; `npm run check` e
`npm run test:e2e:server` verdes.

### Não agora

- **Render incremental:** o render total continua até uma meta de desempenho falhar.
- **Revisão das ADRs** (NestJS ou Fastify puro, plataforma de hospedagem): quando o sync entrar no roteiro.

---

## 5. Primeira fatia: o esqueleto

**Escopo:** FN-01, FN-02 e FN-03, com FD-02, FD-03, FD-04 e FD-05 na medida do que elas tocam, e FD-07 fechando a
fatia.

**Sequência:**

1. Modelo `telos/v1` e `parseBoard`, com testes de domínio.
2. `BoardStore` local, com testes.
3. Tokens e Inter.
4. Home e o canvas novo, com os 5 post-its e o campo Origem no legado.
5. Parede, reaproveitando as peças genéricas.
6. e2e do esqueleto.
7. Substituição do Atlas.

Cada passo deixa `npm run check` verde.

**Pronto quando:** um engenheiro abre o Telos, cria o canvas "Faturamento", escreve dez Domain Events e dois Hotspots
pelo teclado, anota a Origem no legado de um deles e, ao reabrir o navegador, encontra tudo como deixou. Na tela, no
máximo 8 controles.

O plano técnico detalhado dessa fatia é feito em Plan Mode antes de qualquer código, como pede o `CLAUDE.md`.
