# Telos

Parede digital de **Event Storming** num canvas limpo, para qualquer domínio. Os conceitos estão no [glossário](docs/glossario.md). Produto e trabalho vivem no GitHub:

- [PRD: Telos MVP](https://github.com/JoseTheodoro/telos/issues/3), com as funcionalidades como sub-issues;
- [board do projeto](https://github.com/users/JoseTheodoro/projects/3);
- ADRs nas issues com o label [`adr`](https://github.com/JoseTheodoro/telos/issues?q=label%3Aadr).

> O código ainda carrega o modelo narrativo herdado do Atlas (Jornada → Capítulo → Cena → Evento). A troca pelo modelo canônico é o esqueleto ([#1](https://github.com/JoseTheodoro/telos/issues/1)).

## Abrir (uso)

O build portátil gera **um único HTML estático**: `dist/portable/index.html`. Abra com duplo clique (`file://`) ou publique em qualquer host estático. Não é preciso servidor. O build do servidor (`dist/web`, com arquivos em hash) é entregue pelo servidor NestJS.

## Desenvolver

Requer Node 20+.

```bash
npm install
npm run dev        # servidor local com recarga (http://localhost:5173)
npm run build          # typecheck + dist/web (multiarquivo, com hash) + build do servidor
npm run build:portable # typecheck + dist/portable/index.html autocontido
npm run typecheck  # só o TypeScript
```

```bash
cd tests/e2e && npm install && cd ../..
npm run build:portable && npm run test:e2e   # e2e contra file:// (Chrome do sistema)
npm run build && npm run test:e2e:server     # e2e contra o servidor compilado (valida a CSP)
```

> O `index.html` da raiz é a entrada do Vite e **não abre via `file://`**. Use `npm run dev` ou o `dist/portable/index.html`.
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
  styles/app.css
tests/e2e/               roteiros Playwright + run-all.mjs
  fixtures/              massa de teste sintética, sem dado de pessoa real
```

