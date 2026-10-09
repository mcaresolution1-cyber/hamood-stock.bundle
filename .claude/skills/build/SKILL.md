---
description: Build the next phase of an approved plan — implement, test, audit, verify, tick the plan and commit. One phase per run.
argument-hint: <slug> [phase number]
disable-model-invocation: true
---

# /build — implement one phase

Plan: `docs/plans/$0.md`. Phase: `$1` (if empty, the first phase with unticked tasks).

Current state:
!`git status --short | head -30`
!`git branch --show-current`

1. **Gate.** Plan status must be `approved` or `in-progress`. If blocking questions are open, stop and
   ask them (see /plan step 4). Set `status: in-progress`.
2. **Branch.** Work on `feature/$0` (create it from the default branch if missing). Never commit to `main`.
3. **Implement.** Do the phase yourself, or delegate tasks to the **implementer** agent for large phases.
   Follow CLAUDE.md and the Decisions log.
4. **Test.** Delegate to the **test-engineer** agent for the phase's tests and edge cases. If it reports
   code bugs, fix them and re-run.
5. **Audit.** Delegate to the **ledger-auditor** agent (base = default branch). Fix every critical/major
   finding; record any accepted minor finding in the plan's *Decisions log* with the reason.
6. **Verify.** Run `pnpm verify` (lint, typecheck, tests, rule checker, build). Must be green.
7. **UI phases:** run the `/screens` procedure for the new routes and fix layout/RTL problems.
8. **Record.** Tick the phase's tasks, add a line to *Verification log*
   (`date | phase | pnpm verify ✅ | tests N passed | auditor verdict`), then commit:
   `Phase N: <title>` with the attribution trailer from the session instructions.
9. Report: what shipped, test count, auditor verdict, decisions made, next phase. Then stop — the user
   runs `/build` again for the next phase (or says "continue" to keep going).
