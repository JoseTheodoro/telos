#!/usr/bin/env bash
# Lembra o agente do code-review depois de abrir ou atualizar um PR (AGENTS.md → Agent skills → Workflow).
command=$(jq -r '.tool_input.command // ""')
grep -qE '(^|[;&|[:space:]])(gh pr create|git push)([[:space:]]|$)' <<<"$command" || exit 0
jq -n --arg context "PR aberto ou atualizado. Pelo AGENTS.md (Agent skills → Workflow): rode o Skill mattpocock-skills:code-review com o ponto fixo origin/main; corrija toda violação clara e toda lacuna de Spec; deixe npm run check verde; comente no PR os achados que ficaram como julgamento. Um push feito só para aplicar achados da revisão não pede outra revisão." \
  '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $context}}'
