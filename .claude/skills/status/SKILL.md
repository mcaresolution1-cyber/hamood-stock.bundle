---
description: Show where the workflow is — plans and their status, open questions, phase progress, branch and check state.
allowed-tools: Bash(git status *) Bash(git log *) Bash(git branch *)
---

# /status

Plans:
!`for f in docs/plans/*.md; do [ "$(basename "$f")" = _template.md ] && continue; s=$(grep -m1 '^status:' "$f" | cut -d' ' -f2); done_=$(grep -c '^\s*- \[x\]' "$f"); todo=$(grep -c '^\s*- \[ \]' "$f"); echo "$(basename "$f" .md): status=$s tasks=$done_/$((done_+todo))"; done 2>/dev/null || echo "no plans yet"`

Git:
!`git branch --show-current; git status --short | head -20; git log --oneline -5`

Summarise in a short table: plan | status | phase progress | open blocking questions | next step.
Next step is one of `/plan`, `/decide`, `/build <slug>`, `/ship <slug>`.
