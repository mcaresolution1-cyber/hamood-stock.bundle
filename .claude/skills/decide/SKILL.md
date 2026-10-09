---
description: Record the user's answers to a plan's open questions in its Decisions log and update the plan accordingly.
argument-hint: <slug> <answers, e.g. "Q1 A, Q2 use recommended, Q5: phone optional">
disable-model-invocation: true
---

# /decide — record decisions

Plan: `docs/plans/$0.md`. Answers: `$ARGUMENTS`

1. For each answered question, append a row to **Decisions log**:
   `| date | Q# | decision | decided by (user / default) |`. "use recommended" = the Recommended column.
2. Mark the question row as answered (prefix `~~Q#~~` or add ✅) — keep it for history.
3. Update the plan body where the decision changes scope, schema, tasks or tests.
4. If no **blocking** question is unanswered, set `status: approved`.
5. If a decision contradicts CLAUDE.md, ask the user whether CLAUDE.md should change; only edit
   CLAUDE.md if they confirm.

Reply with the decisions recorded and the new plan status.
