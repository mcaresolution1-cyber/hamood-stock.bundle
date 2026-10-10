---
description: Run every project check (lint, typecheck, unit + integration tests, rule checker, production build) and report a pass/fail table.
allowed-tools: Bash(pnpm verify) Bash(pnpm lint) Bash(pnpm typecheck) Bash(pnpm test) Bash(pnpm check:rules) Bash(pnpm build)
---

# /verify

1. Make sure PostgreSQL is running (`pg_isready`; start it with `bash scripts/cloud-setup.sh` if not —
   integration tests need it).
2. Run `pnpm verify`. If it fails, run the failing step alone to get the full output.
3. Report a table: `check | result | detail` for lint, typecheck, tests (passed/failed counts),
   check:rules (errors/warnings), build. For failures, show the first relevant error lines and the
   likely fix. Don't fix anything unless the user asked you to.
