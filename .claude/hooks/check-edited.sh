#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): run the project rule checker and ESLint on the file just
# changed. Problems are sent back to Claude (exit 2 + stderr) so it fixes them immediately.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

FILE="$(jq -r '.tool_input.file_path // empty')"
[ -z "$FILE" ] && exit 0
case "$FILE" in
  *.ts|*.tsx|*.mts|*.mjs|*.js) ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0

PROBLEMS=""
if ! OUT="$(node scripts/check-rules.mjs --files "$FILE" 2>&1)"; then
  PROBLEMS+="$OUT"$'\n'
fi
case "$FILE" in
  */src/*|src/*)
    if ! OUT="$(pnpm -s exec eslint --no-warn-ignored "$FILE" 2>&1)"; then
      PROBLEMS+="$OUT"$'\n'
    fi
    ;;
esac

if [ -n "$PROBLEMS" ]; then
  printf 'Project checks failed for %s — fix before continuing:\n%s' "$FILE" "$PROBLEMS" >&2
  exit 2
fi
exit 0
