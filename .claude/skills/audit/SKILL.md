---
description: Audit the current branch against the Hamood Stock business rules with the ledger-auditor agent.
argument-hint: [base branch, default main]
---

# /audit

Delegate to the **ledger-auditor** agent with base `$ARGUMENTS` (use `main` if that is empty).
Relay its verdict table unchanged. If the verdict is FAIL, list the fixes in priority order and ask
whether to apply them.
