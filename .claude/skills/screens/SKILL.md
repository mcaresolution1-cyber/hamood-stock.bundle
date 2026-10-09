---
description: Screenshot the app at phone and desktop widths in English and Arabic and review layout/RTL with the ui-verifier agent.
argument-hint: [comma-separated routes, e.g. /,/products,/stock-in]
---

# /screens

1. Ensure the database is seeded and the app is running on http://localhost:3000 (start `pnpm dev` in the
   background if not; wait until it responds).
2. Delegate to the **ui-verifier** agent with routes `$ARGUMENTS` (or its defaults).
3. Relay its problem table. Offer to fix the problems; the screenshots stay in `docs/screenshots/` for the PR.
