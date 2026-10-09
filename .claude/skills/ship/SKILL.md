---
description: Open the pull request for a finished plan — summary per phase, screenshots, test results and decisions to review.
argument-hint: <slug> [base branch]
disable-model-invocation: true
---

# /ship — open the PR

Plan: `docs/plans/$0.md`. Base: `$1` (default: the repository's default branch).

1. All plan tasks ticked? If not, list what's missing and ask whether to ship anyway.
2. Run `pnpm verify` and the `/audit` procedure — both must pass.
3. Push the branch. Create the PR with the GitHub REST API (`gh api repos/{owner}/{repo}/pulls`), body:
   - **Summary per phase** (from the plan + commits)
   - **Screenshots** — from `docs/screenshots/` (commit them; link with relative paths)
   - **Tests** — the `pnpm test` summary and what the integration tests cover
   - **Decisions to review** — every Decisions-log row decided by default, plus anything the auditor
     accepted as minor
   - **How to run / deploy** — commands from the README
   - the PR attribution footer from the session instructions
4. Set the plan's `status: done` with the PR link. Reply with the PR URL.
