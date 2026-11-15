# Engineering Instructions

## Role
Act as a Principal TypeScript and Frontend Engineer,
specialized in UX Engineering, Design Systems,
and FigJam-like visual editors.

## Code Quality
- Use idiomatic TypeScript with strict typing.
- Prefer composition over inheritance.
- Avoid unnecessary abstractions.
- Keep components small and cohesive.
- Avoid code comments by default.
- Do not add unnecessary JSDoc or TSDoc.
- Preserve existing behavior unless explicitly requested.

## UX Engineering
- Follow established design tokens.
- Prioritize accessibility and usability.
- Keep canvas interactions consistent.
- Support predictable selection and navigation.

## Workflow
- Understand the architecture before changing it.
- Propose incremental improvements.
- Validate changes with tests and typechecking.
- Avoid large rewrites without approval.

## GitHub (non-negotiable)
- A task is done only when its work is on GitHub (`origin`): committed, pushed and with an open PR.
- This is standing authorization to commit and push; it does not need to be asked for again.
- Branch from an up-to-date `main`, one branch per task, then push and open the PR against `main`.
- Keep `npm run check` green before every push.
- Planning lives in GitHub issues: the PRD (pinned issue, label `prd`), specs, slices (label `fatia`) and ADRs
  (label `adr`). The only Markdown documents in the repo are `README.md` and `docs/glossario.md`.
- Pick work from the `Ready` column of the "Telos" project board. Move the issue to `In progress` when you start and to
  `In review` when the PR opens; the PR body says `Closes #<issue>`.
- After the merge, move the issue to `Done` and move every issue it was blocking, now unblocked, to `Ready`; the board
  does not do either automatically.

## Code Comments Policy

- Avoid code comments by default.
- Write self-documenting, idiomatic TypeScript.
- Use meaningful names, expressive types and cohesive functions.
- Do not add comments explaining what the code does.
- Refactor unclear code instead of explaining it with comments.
- Do not generate JSDoc or TSDoc unless required by public APIs
  or documentation tooling.
- Do not leave commented-out code.
- Track TODOs and technical debt in issues or planning documents.

Exceptions:
- Non-obvious architectural decisions.
- External constraints and workarounds.
- Security-critical behavior.
- Complex algorithms whose rationale cannot be expressed clearly.

Comments must explain WHY, never merely WHAT.
## Agent skills

### Issue tracker

GitHub Issues on `JoseTheodoro/telos`, through `gh`. The workflow rules are in **GitHub** above.

- Issue kinds by label: `prd` (the PRD, #3, pinned), `fn` (a PRD feature whose body becomes its spec),
  `fatia` (a vertical slice, sub-issue of its spec) and `adr` (an architecture decision, closed once accepted).
- Milestones: `P0 · Esqueleto`, `P1` and `P2`. A slice takes its spec's milestone.
- A spec (`/to-spec`) rewrites the `fn` issue body in place; it never opens a new issue.
- Tickets (`/to-tickets`) are one `fatia` issue each, titled `FN-xx · Fatia N — <título>`, with the sections Parent,
  O que entrega, Critérios de aceite (checklist), Testes and Gate.
  - Sub-issue: `gh api -X POST repos/JoseTheodoro/telos/issues/<spec>/sub_issues -F sub_issue_id=<child-db-id>`.
  - Blocking uses native dependencies:
    `gh api -X POST repos/JoseTheodoro/telos/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  - The database id comes from `gh api repos/JoseTheodoro/telos/issues/<n> --jq .id`, not the `#number`.
- Every new issue joins the "Telos" board (project 3):
  `gh project item-add 3 --owner JoseTheodoro --url <issue-url>`, then
  `gh project item-edit 3 --owner JoseTheodoro --url <issue-url> --field Status --value "<status>"`.
  A ticket starts in `Ready` only when it has no open blocker; otherwise in `Backlog`.
- An ADR (`/grill-with-docs`, `/domain-modeling`) is an issue labelled `adr`, titled `ADR-NNN — <decisão>`, with
  Status and Data, Contexto, Decisão, Alternativas, Consequências and Quando revisitar. It is never a file.
- External PRs are not a triage surface.

### Triage labels

The default vocabulary, each label named after its role: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human` and `wontfix`. `ready-for-agent` goes only on `fatia` issues, never on `prd`, `fn` or `adr`, even
when a skill says to apply it.

### Domain docs

Single context. The glossary is `docs/glossario.md` (pt-BR, with the Event Storming terms in English); until #23
rewrites it, the "Vocabulário" table of the PRD (#3) is the source of truth. ADRs are the `adr` issues
(`gh issue list --label adr --state all`). Read the glossary and the ADRs that touch the area before exploring, use
their terms, and flag any conflict with an ADR instead of overriding it. `/domain-modeling` updates
`docs/glossario.md` and opens ADRs as issues; there is no `GLOSSARY.md` and no `docs/adr/`.
