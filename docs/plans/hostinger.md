---
title: Host everything on Hostinger (MariaDB + Node.js web app)
slug: hostinger
spec: user request 2026-10-10 — "use the database and code which can be fully hosted on hostinger, no other service"
status: done # draft → questions → approved → in-progress → done
branch: feature/hostinger-mariadb
pr:
---

# Host everything on Hostinger

## Summary
The app and its data run entirely on the Hostinger Business plan: the Next.js app as a Hostinger
Node.js web app built from GitHub, the data in Hostinger's MariaDB (hPanel calls it "MySQL"; Hostinger
uses MariaDB on web/cloud hosting). PostgreSQL, Neon and Vercel are no longer used. No behaviour changes
for ADMIN / STAFF / VIEWER.

Facts checked (Hostinger docs, 2026-10-10): Business web hosting runs Node.js web apps (Next.js preset,
Node 18/20/22/24, npm/yarn/pnpm from the lockfile, auto-deploy on push, environment variables in the
deploy settings, runtime + build logs, restart). Databases: MySQL-compatible only (MariaDB), host
`localhost`, port 3306. No documented way to run migrations or other commands as part of a deploy.

## Non-goals
- Moving data out of PostgreSQL: nothing was deployed yet, so there is no production data to migrate.
- Supporting PostgreSQL and MariaDB side by side.

## Data model changes
| Change | Migration | Constraint / backfill |
|--------|-----------|-----------------------|
| Provider `postgresql` → `mysql` (MariaDB); `Timestamptz(3)` → `DateTime(3)`; explicit lengths (H7) | `20261010160000_init` replaces both PostgreSQL migrations (H1) | all CHECKs kept |
| Partial unique indexes (one void per entry, one transfer IN per OUT) | same | generated columns `voidOfId` / `transferInOfId` + unique indexes (H5) |
| `StockEntry.linkedEntry` FK `onUpdate: Restrict` | same | needed by the generated columns (H5) |

## Phases

### Phase 1 — MariaDB + self-migrating start-up + Hostinger guide
**Tasks**
- [x] Schema + baseline migration for MariaDB; `@prisma/adapter-mariadb`; shared connection config (`src/lib/db-config.ts`)
- [x] Port raw SQL: counter (`LAST_INSERT_ID`), StockLevel upsert (`ON DUPLICATE KEY`), locks (`LOCK IN SHARE MODE`), opening-stock lock, void lock (`IN (…)`), stock card window, out-by-reason month buckets, case-insensitive search via collation
- [x] Start-up: bundled migrations + migrator + base data via `src/instrumentation.ts`; lazy Prisma client so builds need no database
- [x] `pnpm db:deploy` on the same runner; cloud-setup.sh + test setup on MariaDB; rule checker understands MariaDB quoting
- [x] README: Hostinger deploy, updates, backups, troubleshooting; CLAUDE.md; `.env.example`

**Tests**
- [x] All existing tests on MariaDB 10.11, also with the server at UTC+5 and Node at Asia/Karachi
- [x] `tests/integration/mariadb.test.ts`: UTC storage, READ COMMITTED, migrator (history + checksums, idempotent, failure blocks, concurrent start-ups), base data (first admin only with no users, never resets)
- [x] Rule checker: backtick / unquoted SQL on StockLevel and the ledger

**Done when:** `pnpm verify` green on MariaDB; a production build started with only Hostinger-style
environment variables on an empty database migrates itself, creates the base data and the first admin, and
a browser run (create product → stock in → stock out → reports → Excel) works.

## Decisions log
| Date | # | Decision | Decided by |
|------|---|----------|------------|
| 2026-10-10 | H1 | MariaDB replaces PostgreSQL. The two PostgreSQL migrations are replaced by one MariaDB baseline: they only ever ran on dev/test databases, and a provider change needs a new baseline. One-time exception to "never edit a committed migration", recorded here. | user (Hostinger only) + Claude |
| 2026-10-10 | H2 | The server applies pending migrations at start-up (Hostinger has no deploy-time command). Own runner, because Prisma's WASM engine has no MySQL support and the native engine may not be available. It writes Prisma's `_prisma_migrations` table with Prisma's checksums, so the Prisma CLI stays compatible. A MariaDB named lock serialises concurrent start-ups. `AUTO_MIGRATE=false` turns it off. | Claude |
| 2026-10-10 | H3 | Base data at start-up: counters if missing, the two default warehouses only if there are none, and the first admin from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` only while there are **no users at all**, so a password left in Hostinger's settings can never create or reset an account later. Supersedes B17's per-email rule. | Claude |
| 2026-10-10 | H4 | Every DB session runs in UTC and READ COMMITTED (the stock, void and last-admin checks lock a row, then must see the latest committed data, as on PostgreSQL). Report months use UTC+3 arithmetic (Riyadh has no DST), so the server needs no time-zone tables. | Claude |
| 2026-10-10 | H5 | MariaDB has no partial indexes: "one void per entry" and "one transfer IN per OUT" are enforced with stored generated columns + unique indexes. The linked-entry FK is `ON UPDATE RESTRICT` (ids never change, and MariaDB requires it for those columns). | Claude |
| 2026-10-10 | H6 | Text matching follows the `utf8mb4_unicode_ci` collation: search is case-insensitive (as before), and uniqueness of model codes, emails and warehouse names is now case-insensitive too (`HMD-772` and `hmd-772` can't both exist; model codes were already stored upper-case). | Claude |
| 2026-10-10 | H7 | Column lengths: emails and product names/variants up to 200 characters (the form limits), user names 100, notes and image URLs `TEXT`, other text 191. Photos `MEDIUMBLOB` (4 MB cap unchanged). | Claude |
| 2026-10-10 | H8 | Opening stock is serialised per warehouse with a row lock on the warehouse (`FOR UPDATE`) instead of PostgreSQL's advisory lock. | Claude |
| 2026-10-10 | H9 | Vercel/Neon deployment removed (`vercel-build`, `DIRECT_URL`). Supersedes B18. | user |
| 2026-10-10 | H10 | Bug found in the rehearsal and fixed: the product form sent the already-parsed values (null / numbers) to the server, which re-validates the raw text, so "New product" / "Edit product" failed whenever an optional field was empty. It now sends the raw form values. | Claude |
| 2026-10-10 | H11 | Servers that write the binary log in STATEMENT format refuse writes under READ COMMITTED. Start-up checks `@@log_bin`/`@@binlog_format` and then uses REPEATABLE READ for every connection, with a warning in the logs. The DB constraints still block negative stock and double voids. Tested end to end on MariaDB with `binlog_format=STATEMENT`. | Claude (audit) |

## Verification log
| Date | Phase | pnpm verify | Tests | Auditor |
|------|-------|-------------|-------|---------|
| 2026-10-10 | 1 | ✅ | 217 passed on MariaDB 10.11 (also with the server at UTC+5 and Node at Asia/Karachi) · Hostinger rehearsal: build with no env → start on an empty DB with env vars only → self-migration + base data + first admin → browser run (product, stock in/out, reports, Excel) ✅, repeated with `binlog_format=STATEMENT` ✅ | FAIL → fixed: 1 major (test DB grant) + 6 minor (admin race, guard drift, failed-migration guidance, URL password leak, paths, stale text); fallback bug found in rehearsal fixed |
