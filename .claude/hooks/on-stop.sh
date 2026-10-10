#!/usr/bin/env bash
# Stop: before Claude finishes a turn that changed code, make sure typecheck, unit tests and the
# rule checker pass. If not, Claude is told to keep working (once — stop_hook_active prevents loops).
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

INPUT="$(cat)"
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

# Only when there are uncommitted changes to code, schema or translations.
if [ -z "$(git status --porcelain -- src prisma messages scripts tests 2>/dev/null)" ]; then
  exit 0
fi

FAILED=""
run() {
  local name="$1"; shift
  if ! OUT="$("$@" 2>&1)"; then
    FAILED+="### $name failed"$'\n'"$(echo "$OUT" | tail -n 25)"$'\n\n'
  fi
}
run "typecheck" pnpm -s typecheck
run "tests" pnpm -s test
run "check:rules" node scripts/check-rules.mjs

if [ -n "$FAILED" ]; then
  jq -n --arg r "Checks are failing on your uncommitted changes. Fix them (or explain why not) before stopping:

$FAILED" '{decision: "block", reason: $r}'
fi
exit 0
