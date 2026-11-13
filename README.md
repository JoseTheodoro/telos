# PEP Atlas Studio v1.6

Ferramenta de **Event Storming guiada por jornadas de usuário**: Jornada → Capítulo → Cena → Evento, conectados a domínios, sistemas, telas, tabelas e **caixas semânticas livres** por setas editáveis.

## Abrir (uso)

O build gera **um único HTML estático**: `dist/index.html`. Abra com duplo clique (`file://`) ou publique em qualquer host estático. Não é preciso servidor.

## Desenvolver

Requer Node 20+.

```bash
npm install
npm run dev        # servidor local com recarga (http://localhost:5173)
npm run build      # typecheck + gera dist/index.html autocontido
npm run typecheck  # só o TypeScript
```

```bash
cd tests/e2e && npm install && node run-all.mjs   # testes e2e (Chrome do sistema)
```

> Handoff para quem vai continuar: **`ONDAS_E_PROXIMOS_PASSOS.md`** reúne arquitetura, convenções, o que foi feito em cada onda e o backlog especificado.

> O `index.html` da raiz é a entrada do Vite e **não abre via `file://`**. Use `npm run dev` ou o `dist/index.html`.
>
> O `localStorage` é separado por origem: `localhost:5173` e `file://` têm dados diferentes. Para mover um mapa entre eles, use **Backup JSON** e depois **Importar**.

### Estrutura

```text
index.html               markup do app (entrada do Vite)
src/
  main.ts                bootstrap
  app.ts                 refreshAll, carga inicial, toolbar e teclado
  actions.ts             seleção, conectar, excluir, duplicar, focar
  domain/                modelo puro (sem DOM)
    types.ts             Workspace, entidades, Edge…
    constants.ts         tipos, cores, taxonomia, dimensões
    keys.ts              chaves "tipo:id"
    model.ts             graphInit, upgradeWorkspace, syncMaps, regras de seta
  core/                  estado, persistência (localStorage) e undo/redo
  canvas/                visibilidade por recorte, layout, câmera, render, eventos de ponteiro
  ui/                    barra lateral, inspetor, modal, apresentação, caderno, helpers de DOM
    rich.ts              destaque de código (highlight.js) e Markdown sanitizado (marked + DOMPurify)
    docs.ts              caderno de notas Markdown (#21)
  io/files.ts            importar/exportar JSON, CSV, SVG
  data/seed.json         mapa de exemplo
  styles/app.css
tests/e2e/               roteiros Playwright + run-all.mjs
legacy/PEP_Atlas_Studio_v1.5.html   versão original de arquivo único (referência)
```

## Histórico

### Onda 3 · Canvas livre (em andamento)

- **#10 Notas livres no canvas.** O botão **＋ Nota** cria a nota no centro da tela, e a tecla `T` cria **onde o cursor está**. A nota é um post-it redimensionável (alça ◢ no canto) com **formato**: Texto, Markdown, **JSON, SQL, Bash**, JavaScript, TypeScript, Python, Java, C#, Go, YAML, XML/HTML, HTTP ou Dockerfile. O código aparece com destaque de sintaxe. A edição acontece dentro do próprio card: duplo clique, `Enter` ou `F2` abrem o editor, `Tab` indenta, `Esc` ou `Ctrl+Enter` salvam, e a nota nova que ficar vazia é descartada. O botão **⧉ Copiar** copia o conteúdo bruto. No formato JSON, a nota avisa quando o JSON é inválido e oferece **{ } Formatar JSON**. A nota aparece no recorte em que foi criada, além do mapa completo e de onde estiver ligada por seta; "Organizar" não a move. O catálogo busca pelo conteúdo, e o SVG exportado inclui as notas. A roda do mouse rola o conteúdo da nota (`Ctrl` + roda continua dando zoom).
- **#21 Caderno de notas Markdown.** Uma nova área, **✎ Caderno**, fica no topo ao lado de **◇ Canvas**. Cada nota tem título, corpo em Markdown (GFM: tabelas, tarefas, blocos de código com destaque) e **vínculo opcional a uma jornada ou capítulo**. O editor tem os modos Editar, Dividir (texto + pré-visualização) e Ver, além de uma barra de formatação: negrito, itálico, título, listas, tarefa, citação, código, link, tabela, separador e bloco de código com a linguagem escolhida. `Ctrl+B` e `Ctrl+I` funcionam no texto. As tarefas são clicáveis na pré-visualização. A lista tem busca e os filtros **Recorte** (segue a jornada ou capítulo escolhido na barra lateral), **Todas** e **Sem vínculo**. Uma nota nova já nasce vinculada ao recorte atual. Dá para exportar a nota ou o filtro inteiro em `.md`. No canvas, o inspetor da jornada ou do capítulo lista as notas vinculadas e cria uma nova. "◇ Ver no canvas" volta ao recorte vinculado. Todo HTML gerado de Markdown passa pelo DOMPurify, sem scripts, eventos `on*`, `javascript:` ou iframes.
- **Correção: salvamento do caderno.** O caderno grava 300 ms depois da última tecla, em vez de regravar o mapa inteiro a cada tecla. Fechar ou recarregar a página grava o que estiver pendente. Quando o mapa passa de 4 MB (o navegador guarda cerca de 5 MB), o indicador de salvamento fica em alerta e um aviso sugere exportar o Backup JSON.
- **Dependências** (embutidas no `dist/index.html`, então o app funciona offline): `highlight.js` 11.12.0 (core + 14 linguagens), `marked` 18.1.2 e `dompurify` 3.4.17, com versões fixadas.

### Onda 2 · É uma jornada

- **#6 Timeline horizontal da jornada.** Novo layout, **Timeline**, em que o tempo corre da esquerda para a direita. Cada evento ocupa uma coluna, e cada capítulo vira uma faixa de fundo com número, título e data. As linhas, de cima para baixo: hotspots, jornada, capítulos, cenas, **eventos**, fluxo de Event Storming (caixas livres abaixo do evento a que se ligam) e, por fim, domínios, sistemas, telas e tabelas, alinhados aos eventos que os usam. Um seletor **Timeline | Camadas** alterna entre os modos, e cada modo guarda as próprias posições. Mapas novos abrem na Timeline, e mapas que já tinham arranjo em camadas continuam abrindo em Camadas. Na Timeline, `Tab` e `Enter` inserem eventos, cenas e capítulos **na sequência**, empurrando o resto para a direita. O evento paralelo (`Enter` num evento) fica abaixo, e `H` põe o hotspot acima do card. As setas escolhem o lado de saída pela posição: com o destino empilhado, saem por baixo ou por cima, em vez do laço de antes. Quando o mapa não cabe na tela, "Enquadrar" começa pelo início da jornada. O SVG exportado inclui as faixas de capítulo.
- **#7 Raias por ator.** Na Timeline, a linha de eventos se divide em **faixas por quem age**: Paciente/família, Recepção/cadastro, Enfermagem, Médico, Exames/laudos, Sistemas/autoatendimento e Outros. As cenas seguem como cabeçalho, cada evento desce para a raia da sua cena, e as passagens entre atores aparecem como setas diagonais. Os nomes das raias ficam fixos na borda esquerda, com a contagem de eventos, e viram rótulos compactos com zoom baixo. A raia é um campo explícito da cena ("Raia na timeline"), escolhido no inspetor ou no modal. Dá para cadastrar raias novas, que entram antes de "Outros". Na carga, a raia é inferida uma única vez do texto livre "Ator / equipe" (ex.: "Atendente / Recepção" → Recepção). O botão **☰ Raias** liga e desliga as faixas, e cada estado guarda o próprio arranjo. Trocar a raia de uma cena reorganiza o recorte, `Tab` mantém o evento na mesma raia e `Enter` cria uma cena irmã que herda a raia. O SVG exportado inclui as faixas.
- **#8 Curva de emoção e dores.** Cada cena ganha uma **nota de emoção** de −2 (😣 muito ruim) a +2 (😀 muito bom) e um campo **Dor / pain point**. Na Timeline, uma faixa acima dos cards desenha a **curva de emoção** do recorte, com um ponto por cena alinhado à coluna dela, área verde acima do neutro e vermelha abaixo. As dores aparecem como chips ⚡ embaixo do ponto. Para dar nota, **arraste o ponto para cima ou para baixo** (`Ctrl+Z` desfaz) ou use os botões no inspetor; cenas sem nota aparecem como "?" no neutro. Clicar no ponto ou na dor seleciona a cena. O botão **⚡ Virar hotspot** cria um hotspot ligado à cena com o texto da dor. O card da cena mostra a emoção e a dor também em Camadas. O botão **〰 Emoção** mostra ou oculta a faixa sem mexer nas posições. O SVG exportado inclui a curva, e o CSV ganha as colunas "Emoção da cena" e "Dor da cena".
- **#9 Modo apresentação.** O botão **▶ Apresentar** (ou a tecla `P`) abre a jornada em tela inteira, **uma cena por vez**, na ordem dos capítulos. Começa na cena selecionada ou focada; sem nenhuma, começa no início do recorte. Cada tela mostra o capítulo, o momento, a raia, o título, o ator e a história, além das perguntas e respostas da oficina, da emoção (dá para dar nota ali mesmo, com `Ctrl+Z`), da dor, dos eventos com os sistemas e telas que tocam e dos hotspots ligados à cena ou aos eventos dela. Embaixo fica a **mini curva da jornada**, com um ponto por cena: clicar num ponto pula para a cena. Navegação: `←` `→`, espaço, `Home` e `End`. `F` alterna a tela cheia e `Esc` sai, deixando a cena atual selecionada no canvas. **◇ Ver no canvas** fecha a apresentação e abre o recorte dessa cena. Enquanto a apresentação está aberta, os atalhos do canvas (N, H, Del, Tab…) ficam desligados.
- **Correção:** os botões −, + e ⤢ do canto do canvas não respondiam ao mouse, porque o pan capturava o ponteiro. O bug vinha da v1.5.
- **Ajuste da #4:** "Hotspot" deixou de ser tipo semântico de caixa livre, e o hotspot de verdade (tecla `H`) passou a ser o único caminho. Caixas livres antigas com esse tipo são promovidas a hotspot na carga, com as mesmas setas e posições.

### Onda 1 · Parece Event Storming

- **#1 Cores canônicas de Event Storming + legenda.** O tipo semântico define o post-it: Ator (amarelo), Comando/Ação (azul), Agregado/Estado (amarelo-claro), Evento (laranja), Política/Regra (lilás), Read model/Tela (verde), Sistema/Integração (rosa) e Hotspot/Dúvida (vermelho). Sem tipo semântico, valem os padrões estruturais: evento é laranja, sistema é rosa, tela é verde e os demais ficam como estrutura neutra. A legenda fica no canto do canvas, conta os elementos do recorte e pode ser recolhida. O inspetor mostra qual post-it o elemento representa. O mapeamento está em `src/domain/es.ts`.
- **#2 Edição inline do nome.** Duplo clique no card (ou `F2` com o card selecionado) transforma o nome num campo de texto. `Enter` ou clicar fora salva, `Esc` cancela. Nome vazio é recusado e `Ctrl/Cmd+Z` desfaz. Junto vieram duas correções no inspetor: o título acompanha a digitação, e focar um campo sem alterar nada não cria mais um "desfazer" vazio.
- **Correção:** os contadores de nós, setas e relações zeram depois de "Limpar canvas".
- **#3 Criação encadeada ("tempestade rápida").** Segue a convenção de mapas mentais. Com um card selecionado, **`Tab`** cria o próximo passo à direita, já conectado: jornada → capítulo → cena → evento, e um evento leva ao próximo evento da cena com seta de sequência. Uma caixa livre leva a outra do mesmo tipo, também com seta. **`Enter`** cria um irmão abaixo, do mesmo tipo e com o mesmo pai. O card nasce em modo de edição: dentro do editor, `Tab` salva e encadeia o próximo, `Enter` só salva, e `Esc` ou nome vazio descartam a criação. Criar e nomear contam como um passo só de desfazer. Se o card novo não couber no recorte atual, o recorte se abre (cena → capítulo → jornada). Os mesmos comandos aparecem como botões no inspetor.
- **#4 Hotspot no canvas.** Os hotspots da oficina viraram post-its vermelhos no canvas, conectáveis a qualquer card. Com um card selecionado, **`H`** ou **＋ Hotspot** cria a dúvida ao lado dele, já ligada ("levanta dúvida") e em modo de edição. Sem seleção, ela nasce solta no centro da tela. O inspetor do hotspot tem título, descrição, status, prioridade, responsável e resolução. Hotspot resolvido fica esmaecido e riscado. A aba **Hotspots** mostra o total em aberto e a que cards cada um está ligado, e **Ver no canvas** abre a cena do hotspot. Os dados continuam em `decisions`, compatíveis com a v1.5: na primeira carga, cada hotspot com `sceneId` vira uma seta "cena → hotspot". "Limpar canvas" continua preservando os hotspots.
- **#5 Gramática de Event Storming nas setas.** Ao ligar elementos do fluxo, o rótulo vem sugerido: Ator → *executa* → Comando → *é tratado por* → Agregado → *emite* → Evento → *dispara* → Política → *aciona* → Comando. Também valem Evento → *atualiza* → Read model, Read model → *informa* → Ator, Evento → *precede* → Evento, e o fluxo de estados da oficina: Estado → *habilita* → Ação → *leva a* → Estado. Uma ligação fora do padrão nunca é bloqueada. Ela ganha um ⚠ discreto na legenda da seta, e o inspetor sugere a "ponte" que falta (ex.: Evento → **Política** → Comando). A seta pode ser marcada como **exceção consciente**. Se o rótulo divergir do sugerido, o inspetor oferece "Usar 'emite'". Numa caixa livre, `Tab` avança no fluxo (Comando → Agregado → Evento → Política → Comando; Ação ⇄ Estado). A gramática vale só para setas com caixa livre ou entre eventos: as setas de rastreabilidade técnica (evento → sistema, tela ou tabela; cena → domínio) ficam de fora. A gramática fica em `src/domain/grammar.ts`.
- **Dívida paga:** o papel do domínio numa seta evento → domínio virou o campo explícito `role` (responsável ou consumidor), editável no inspetor. Antes era deduzido do texto do rótulo, e renomear a seta quebrava o mapeamento sem aviso. Backups antigos são migrados pelo rótulo na carga.
- **Correção:** atalhos de uma tecla (`N`, `H`, `C`, `V`) não deixam mais a letra vazar para o campo que acabaram de abrir. O bug vinha da v1.5: `N` abria o modal com "n" no nome.

### v1.6: migração técnica, sem mudança funcional

- Código migrado do HTML de arquivo único para **Vite + TypeScript (strict)** em módulos.
- O build continua gerando um único HTML estático (`vite-plugin-singlefile`).
- Mesma chave de `localStorage` e mesmo formato de backup JSON: os dados da v1.5 continuam válidos.
- Comportamento validado contra a v1.5 com um roteiro automatizado no Chrome (navegação, criação, setas, cor, arrastar, desfazer/refazer, catálogo, hotspots, reload, limpar canvas): resultados idênticos e nenhum erro de console.

### v1.5

1. **Tipos estruturais e semânticos**: os oito tipos existentes foram mantidos (Jornada, Capítulo, Cena, Evento, Domínio, Sistema, Tela e Tabela). Há também **Caixa livre**, que não exige cena ou capítulo. O editor oferece dezenas de classificações semânticas (Estado, Ação, Evento de domínio, Política, Agregado, Decisão, Projeção etc.) e permite criar outras classificações. Os botões `＋ Estado` e `＋ Ação` criam caixas livres rapidamente.
2. **Limpar canvas sem perder hotspots**: o botão `✕ Limpar canvas` exige digitar **APAGAR**, oferece backup e limpa os nós, conexões e posições. **Os hotspots, suas resoluções e os cadastros de classificações permanecem**. O canvas vazio também é salvo.
3. **JetBrains Mono**: o HTML usa a fonte JetBrains Mono via Google Fonts quando há acesso à internet. Sem conexão, usa a fonte monoespaçada local de fallback. Não inclui arquivos de fonte.
4. **Cores por seta**: selecione uma conexão no mapa para abrir o inspetor. Escolha uma entre dez cores, use o controle nativo `<input type="color">` com seleção pelo mouse ou informe hexadecimal `#RRGGBB`. O botão **Auto** restaura a cor automática. READ nasce laranja e WRITE vermelho, mas a cor da conexão pode ser sobrescrita conscientemente.

## Dados e persistência

- As alterações são salvas automaticamente no `localStorage` do navegador.
- O editor reaproveita a chave `pep-atlas-studio-v4`, garantindo compatibilidade com as versões V4/V4.1 quando abertas na **mesma origem de armazenamento**.
- Alguns navegadores podem isolar os dados de arquivos `file://` conforme o caminho ou o perfil. Se a versão anterior não aparecer, use **Backup JSON** nela e **Importar** na v1.5.
- A exportação JSON contém o mapa completo, inclusive hotspots, posições, cores e preferências.
- **Limpar canvas não exclui backups já exportados.** Limpar os dados do navegador ou usar outro perfil pode remover a cópia de `localStorage`.
- Para uso por vários engenheiros, recomendo versionar o backup JSON em repositório. Esta versão não faz sincronização multiusuário em tempo real nem grava automaticamente em JSON no disco.

## Usar na oficina

- Crie ou escolha uma jornada, depois capítulos e cenas.
- Registre os eventos e associe-os a domínio, sistema, tela e tabela por conexões.
- Para desenhar estados, ações, decisões ou fluxos que não pertencem a uma cena, use **Caixa livre**.
- Clique em cada seta para definir significado, evidência, READ/WRITE e cor.
- Registre dúvidas e riscos como **hotspots** (tecla `H` no card selecionado). Eles ficam no canvas, ligados ao que questionam, e também na aba **Hotspots**. Reiniciar o canvas não os apaga.

## Limites

- O app é um arquivo HTML estático: não abre shell, não executa binários locais e não acessa bancos de dados por conta própria.
- Para executar Claude Code dentro do app e criar elementos por IA, consulte `PROPOSTA_v2_TERMINAL_E_AGENTES.md`.
