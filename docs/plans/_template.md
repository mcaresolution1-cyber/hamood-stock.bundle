---
title: <Feature name>
slug: <slug>
spec: docs/specs/<slug>.md
status: draft # draft → questions → approved → in-progress → done
branch: feature/<slug>
pr:
---

# <Feature name>

## Summary
<!-- 3–5 lines: what ships, for which roles (ADMIN / STAFF / VIEWER). -->

## Non-goals
- …

## Data model changes
| Change | Migration | Constraint / backfill |
|--------|-----------|-----------------------|
| none   |           |                       |

## Phases

### Phase 1 — <title>
**Server actions / routes**
| Action / route | Permission | Warehouse check |
|----------------|------------|-----------------|

**Tasks**
- [ ] … (`path/to/file.ts`)

**Tests**
- [ ] … (`tests/integration/….test.ts`)

**Translations:** `<namespace>.*`

**Done when:** …

<!-- repeat per phase -->

## Risks
| Risk | Mitigation |
|------|------------|

## Open questions
<!-- Filled by the cross-examiner. Answered ones are marked ✅ and recorded below. -->

## Conflicts with CLAUDE.md
- none

## Edge cases the plan must cover
- [ ] …

## Decisions log
| Date | Q | Decision | Decided by |
|------|---|----------|------------|

## Verification log
| Date | Phase | pnpm verify | Tests | Auditor |
|------|-------|-------------|-------|---------|
