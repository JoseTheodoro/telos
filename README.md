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
  ui/                    barra lateral, inspetor, modal, helpers de DOM
  io/files.ts            importar/exportar JSON, CSV, SVG
  data/seed.json         mapa de exemplo
  styles/app.css
legacy/PEP_Atlas_Studio_v1.5.html   versão original de arquivo único (referência)
```

## Histórico

### Onda 1 · Parece Event Storming

- **#1 Cores canônicas de Event Storming + legenda.** O tipo semântico define o post-it: Ator (amarelo), Comando/Ação (azul), Agregado/Estado (amarelo-claro), Evento (laranja), Política/Regra (lilás), Read model/Tela (verde), Sistema/Integração (rosa) e Hotspot/Dúvida (vermelho). Sem tipo semântico, valem os padrões estruturais: evento é laranja, sistema é rosa, tela é verde e os demais ficam como estrutura neutra. A legenda fica no canto do canvas, conta os elementos do recorte e pode ser recolhida. O inspetor mostra qual post-it o elemento representa. O mapeamento está em `src/domain/es.ts`.

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
- Na aba **Hotspots**, faça o registro de dúvidas e decisões sem perder esse conhecimento ao reiniciar o canvas.

## Limites

- O app é um arquivo HTML estático: não abre shell, não executa binários locais e não acessa bancos de dados por conta própria.
- Para executar Claude Code dentro do app e criar elementos por IA, consulte `PROPOSTA_v2_TERMINAL_E_AGENTES.md`.
