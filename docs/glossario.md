# Glossário de Event Storming no Atlas

Numa sessão de Event Storming, as pessoas que conhecem o processo escrevem na parede, em post-its laranja, os fatos que
acontecem, e os ordenam no tempo. Os outros post-its (comando, política, sistema, hotspot) entram quando a história já
está de pé.

O Atlas acrescenta uma estrutura narrativa a essa parede, para que uma história longa continue legível:
**Jornada → Capítulo → Cena → Evento**, com o **Ator** de cada cena. Este glossário explica cada conceito, como ele
aparece numa sessão e onde fica no app. Os exemplos vêm da massa sintética dos testes
(`tests/e2e/fixtures/oficina-sintetica.json`), que não descreve nenhum atendimento real.

## A hierarquia narrativa

```text
Jornada ──contém──▶ Capítulo ──contém──▶ Cena ──contém──▶ Evento
                                          │
                                          └── Ator (quem age; define a raia)
```

- Cada capítulo pertence a uma jornada, cada cena a um capítulo e cada evento a uma cena.
- O app desenha sozinho as setas **contém** entre pai e filho. Escolher "Não definido" como pai remove a seta.
- Uma jornada com filhos não pode ser excluída: o app pede para mover os filhos antes.

## Jornada

**O que é.** A história inteira que a sessão quer entender, do primeiro contato ao desfecho. Na linguagem do Event
Storming, é o escopo da parede: onde a linha do tempo começa e onde termina.

**Na sessão.** Combine o começo e o fim antes da primeira caneta. Uma sessão pode ter mais de uma jornada, quando o
mesmo time olha fluxos que não se cruzam.

**No Atlas.** Coleção `journeys`. A jornada aparece na raiz da árvore da aba **Jornada** e contém capítulos.

**Exemplo.** "Jornada de exemplo": do cadastro ao retorno, passando por consulta, exame laboratorial e procedimento.

**Perguntas para a sala.** Onde a história começa? Onde ela termina? Do ponto de vista de quem ela é contada?

## Capítulo

**O que é.** Uma grande etapa da jornada, com um marco no tempo. Os capítulos costumam nascer dos *eventos pivô*: os
fatos depois dos quais a história muda de assunto (a consulta terminou, a amostra foi coletada).

**Na sessão.** Depois da tempestade de eventos, procure os eventos pivô na parede e trace uma linha vertical em cada
um. Cada trecho entre duas linhas vira um capítulo.

**No Atlas.** Coleção `chapters`, ligada à jornada por `journeyId`. Campos principais:

| Campo   | Para que serve                                                      |
|:--------|:--------------------------------------------------------------------|
| `label` | Nome curto do capítulo, mostrado na árvore e no card                |
| `title` | Frase que resume o que acontece no capítulo                         |
| `date`  | Marco no tempo, absoluto ou relativo (`D0`, `D+3`, `A definir`)     |
| `deck`  | Subtítulo que explica por que o capítulo importa                    |
| `mood`  | Verbo que dá o tom do capítulo (Identificar, Compreender, Rastrear) |

**Exemplo.** "A consulta" (`D0`) e "O exame laboratorial" (`D+3`).

## Cena

**O que é.** Um momento concreto dentro de um capítulo: um lugar, uma hora, alguém agindo. A cena é a unidade de
narração. É nela que a sala conta o que acontece e registra o que ainda não sabe.

**Na sessão.** Agrupe em cena os eventos que acontecem juntos, para a mesma pessoa e no mesmo lugar. Se a sala precisa
de mais de uma frase para explicar o grupo, ele provavelmente tem duas cenas.

**No Atlas.** Coleção `scenes`, ligada ao capítulo pelo campo `chapter`. Campos principais:

| Campo                   | Para que serve                                                 |
|:------------------------|:---------------------------------------------------------------|
| `title`                 | O que acontece, numa frase                                     |
| `time`                  | Quando acontece, dentro do capítulo                            |
| `story`                 | A narrativa contada pela sala                                  |
| `actor`                 | Quem age (ver Ator)                                            |
| `questions` / `answers` | Perguntas levantadas e respostas obtidas na sessão             |
| `discussed`             | Se a cena já foi discutida                                     |
| `lane`                  | Raia da cena no modo **☰ Raias**                               |
| `emotion` / `pain`      | Como a pessoa se sente (de −2 a +2) e a dor, no **〰 Emoção** |

**Exemplo.** "A enfermagem acolhe e afere", no capítulo "A consulta".

## Ator

**O que é.** Quem age ou decide na cena. No Event Storming, é o post-it amarelo que fica ao lado do comando que a
pessoa dispara.

**Na sessão.** Escreva o papel, não o nome: "Enfermagem", "Recepção", "Paciente". O mapa circula entre times, nome de
pessoa é dado pessoal, e o papel generaliza a história para todos que ocupam a função.

**No Atlas.** O ator aparece de duas formas:

1. **Campo `actor` da cena**, em texto livre no formato "Papel / detalhe". Na migração de mapas antigos, o texto sugere a
   raia da cena; depois disso, a raia é de quem edita o mapa. As raias padrão são: Paciente / família, Recepção /
   cadastro, Enfermagem, Médico, Exames / laudos, Sistemas / autoatendimento e Outros / a definir.
2. **Caixa livre** do tipo Ator, Papel ou Responsável: o post-it amarelo, que entra na gramática das setas
   (Ator → *executa* → Comando).

**Não confunda** com Sistema (post-it rosa): o totem e o aplicativo são sistemas, mesmo quando é o paciente quem toca na
tela.

## Evento

**O que é.** Um fato relevante para o negócio, escrito no passado: "Pré-consulta iniciada", "Amostra coletada",
"Laudo liberado". É o post-it laranja e o centro do Event Storming: os outros post-its existem para explicar por que um
evento aconteceu ou o que acontece depois dele.

**Na sessão.** Qualquer pessoa escreve eventos, um por post-it, sempre no passado. Eventos repetidos ou em conflito não
se apagam: viram hotspot.

| Forma        | Exemplo                | Por quê                                        |
|:-------------|:-----------------------|:-----------------------------------------------|
| Evento       | "Pagamento confirmado" | Fato no passado: algo que já aconteceu         |
| Não é evento | "Confirmar pagamento"  | É um comando: a intenção de fazer algo         |
| Não é evento | "Pagamento"            | Substantivo solto: não diz o que aconteceu     |

**No Atlas.** Coleção `events`, ligada à cena por `sceneId`. Campos principais:

| Campo          | Para que serve                                                                                                           |
|:---------------|:-------------------------------------------------------------------------------------------------------------------------|
| `name`         | O fato, no passado                                                                                                       |
| `type`         | Natureza: Clínico, Assistencial, Operacional, Auditoria, Integração ou Em discussão                                     |
| `destination`  | Para onde o fato vai: Prontuário / PEP, Linha do tempo clínica, Sistema de origem, Mensageria, Auditoria, Não enviar ao PEP ou A definir |
| `note`         | Observação da sala                                                                                                       |
| `reviewStatus` | Situação da revisão do evento                                                                                            |

Uma caixa livre dos tipos Evento de domínio, Evento de integração, Evento externo, Evento temporal, Evento clínico,
Evento operacional, Fato ou Transição de estado também vira post-it laranja.

## Os post-its canônicos no Atlas

A cor de cada card segue o post-it canônico do Event Storming. A legenda do canvas conta os post-its de cada cor no
recorte aberto; jornada, capítulo e cena entram na linha "Estrutura da jornada".

| Post-it            | Cor           | O que representa                       | No Atlas                                                                                 |
|:-------------------|:--------------|:---------------------------------------|:-----------------------------------------------------------------------------------------|
| Ator               | amarelo       | Quem age ou decide                     | Caixa livre Ator, Papel ou Responsável; na cena, o papel fica no campo `actor`           |
| Comando / Ação     | azul          | Intenção: o que alguém pede ao sistema | Caixa livre Comando, Ação, Solicitação, Tarefa, Atividade humana ou automática           |
| Agregado / Estado  | amarelo-claro | Quem guarda o estado e as invariantes  | Caixa livre Agregado, Entidade, Estado ou Objeto de valor                                |
| Evento de domínio  | laranja       | Fato relevante, sempre no passado      | Evento da cena; caixa livre dos tipos de evento                                          |
| Política / Regra   | lilás         | Reação: "sempre que X, então Y"        | Caixa livre Política, Regra de negócio, Regra clínica, Invariante, Decisão, Condição, Validação ou Restrição |
| Read model / Tela  | verde         | Informação que apoia a decisão         | Tela do catálogo; caixa livre Read Model, Projeção ou Consulta / Query                   |
| Sistema / Integração | rosa        | Sistema envolvido ou externo           | Sistema do catálogo; caixa livre Sistema interno ou externo, Serviço, API, Mensageria, Fila ou Integração |
| Hotspot / Dúvida   | vermelho      | Risco, conflito ou pergunta em aberto  | Hotspot (tecla `H`); caixa livre Risco, Pergunta em aberto ou Hipótese                   |

Jornada, capítulo e cena não têm post-it canônico: são a moldura narrativa que o Atlas acrescenta à parede.

### A gramática das setas

Ao ligar dois post-its do fluxo, o app sugere o rótulo da seta. Se a ligação pula uma etapa, ele avisa sem bloquear e
indica o post-it que costuma ficar no meio: entre Evento e Comando, por exemplo, falta uma Política.

```text
Ator ──executa──▶ Comando ──é tratado por──▶ Agregado ──emite──▶ Evento ──dispara──▶ Política ──aciona──▶ Comando
```

| De       | Para      | Rótulo sugerido |
|:---------|:----------|:----------------|
| Ator     | Read model | consulta       |
| Read model | Ator    | informa         |
| Comando  | Evento    | gera            |
| Comando  | Sistema   | é enviado a     |
| Sistema  | Evento    | emite           |
| Evento   | Read model | atualiza       |
| Evento   | Evento    | precede         |
| Evento   | Sistema   | notifica        |

Para modelar estados, as caixas livres Estado e Ação têm rótulos próprios: Estado → *habilita* → Ação,
Ação → *leva a* → Estado e Estado → *transiciona para* → Estado.

A gramática vale para o fluxo do Event Storming: setas que envolvem caixas livres ou que ligam dois eventos. As setas
de rastreabilidade (evento → sistema, tela ou tabela; cena → domínio) e as de hotspot ficam fora dela.

## Roteiro de uma sessão no Atlas

1. **Combine a jornada.** Crie a jornada com o começo e o fim combinados.
2. **Tempestade de eventos.** Todos escrevem eventos no passado. Com um card selecionado, `Tab` cria o próximo passo à
   direita.
3. **Ordene e corte.** Ordene os eventos no tempo, agrupe-os em cenas e crie os capítulos nos eventos pivô.
4. **Dê nome a quem age.** Preencha o ator de cada cena com o papel. O modo **☰ Raias** mostra cada evento na faixa de
   quem age.
5. **Marque as dúvidas.** Cada pergunta, risco ou conflito vira um hotspot (tecla `H` no card selecionado).
6. **Aprofunde o fluxo.** Acrescente comandos, políticas, agregados e read models como caixas livres; a gramática
   sugere os rótulos das setas.
7. **Rastreie.** Ligue os eventos a domínio, sistema, tela e tabela para enxergar onde cada fato nasce e é registrado.
8. **Olhe pela pessoa.** No **〰 Emoção**, dê uma nota de −2 a +2 a cada cena e registre a dor.
9. **Guarde o trabalho.** Exporte o **↓ Backup JSON** ao fim da sessão.

## Um recorte da massa sintética

| Conceito | Exemplo                                                |
|:---------|:-------------------------------------------------------|
| Jornada  | Jornada de exemplo                                     |
| Capítulo | A consulta (`D0`)                                      |
| Cena     | A enfermagem acolhe e afere                            |
| Ator     | Enfermagem (raia Enfermagem)                           |
| Eventos  | Pré-consulta iniciada → Pré-consulta concluída         |
| Hotspot  | E-03: Informação ausente ou negada?                    |
