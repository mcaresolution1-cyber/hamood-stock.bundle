@AGENTS.md

# Hamood Stock

Inventory web app for **Hamood TV** (hamoodtv.com, حمود للطاولات) — a Riyadh business selling TV wall
mounts, floor stands, monitor mounts and TV tables from several warehouses. Staff record stock coming in
(supplier deliveries, customer returns), going out (website orders, direct sales, installations), transfers
between warehouses and corrections. Managers see current stock per warehouse and the full movement history.

Users work on phones in the warehouse → **mobile-first**, and in **English and Arabic (RTL)**.

## How we work — read docs/workflow.md

Features go through **plan → cross-question → decide → build → test → audit → verify → ship** using the
project commands `/plan`, `/decide`, `/build`, `/verify`, `/audit`, `/screens`, `/ship`, `/status` and the
agents in `.claude/agents/`. Rules for every session:

- Don't start coding a feature without a plan in `docs/plans/<slug>.md` whose status is `approved`
  (small fixes are exempt). Decisions in a plan's **Decisions log** override the spec.
- One phase per commit (`Phase N: <title>`), on a `feature/<slug>` branch, never on `main`.
- Hooks run the rule checker + ESLint after every edit and typecheck/tests/rules before you stop —
  fix what they report rather than working around them. `// rules-allow: <rule> — <reason>` only with a
  real reason.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, `src/`), TypeScript, pnpm |
| Database | PostgreSQL 16 + Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`) |
| Auth | Auth.js / NextAuth v5 (beta), Credentials provider (email + password, bcryptjs), JWT sessions |
| UI | Tailwind CSS v4 + shadcn/ui (new-york style, Radix) — components in `src/components/ui` |
| Forms | React Hook Form + Zod 4 + `@hookform/resolvers` |
| i18n | next-intl 4, cookie-based locale (no `/en` `/ar` URL prefix), `en` + `ar` |
| Tables / export | `@tanstack/react-table`, `exceljs` |
| Tests | Vitest |

Next.js 16 differs from older versions you may know (e.g. `middleware.ts` is now `src/proxy.ts`).
Read `node_modules/next/dist/docs/` before using an unfamiliar API (see AGENTS.md).
`cacheComponents` is deliberately **off** (every page is per-user and per-locale).

## Commands

```bash
pnpm dev              # dev server on http://localhost:3000
pnpm build            # production build
pnpm start            # run production build
pnpm lint             # ESLint
pnpm typecheck        # next typegen + tsc --noEmit
pnpm test             # Vitest: unit + integration (integration needs PostgreSQL)
pnpm db:migrate       # prisma migrate dev (create + apply a migration)
pnpm db:deploy        # prisma migrate deploy (apply pending migrations)
pnpm db:seed          # idempotent seed (admin, warehouses, sample products, counters)
pnpm db:studio        # Prisma Studio
pnpm db:generate      # regenerate the Prisma client (also runs on pnpm install)
pnpm db:migrate:wasm create <name>   # fallback: create a migration without the native engine
pnpm db:migrate:wasm deploy          # fallback: apply migrations without the native engine
pnpm setup:cloud      # = bash scripts/cloud-setup.sh (see below)
pnpm test:unit        # unit tests only (no database needed)
pnpm test:integration # PostgreSQL tests against <db>_test (created + migrated automatically)
pnpm check:rules      # project rule checker (ledger, auth, hard deletes, migrations, i18n)
pnpm verify           # lint + typecheck + all tests + check:rules + build
pnpm screenshots      # phone/desktop × EN/AR screenshots of the running app → docs/screenshots/
```

Before finishing any change run `pnpm verify`.

### Fresh cloud session / new machine

Run `bash scripts/cloud-setup.sh`. It is idempotent: installs/starts PostgreSQL, writes `.env` from
`.env.example` (random `AUTH_SECRET`, DB password and `SEED_ADMIN_PASSWORD`) if missing, creates the DB role
and database, then `pnpm install`, `prisma generate`, migrations and seed.
Log in as `admin@hamoodtv.local` with `SEED_ADMIN_PASSWORD` from `.env`.

### Migrations when binaries.prisma.sh is blocked

The Prisma CLI downloads a native schema engine from `binaries.prisma.sh`. Claude Code cloud sessions block
that host, so `prisma migrate dev/deploy` fail there. `cloud-setup.sh` detects this and uses
`scripts/prisma-wasm.mjs`, which runs Prisma's **WASM** schema engine (same engine, same SQL, same
`_prisma_migrations` table — fully compatible with the normal CLI). In that environment:

1. Edit `prisma/schema.prisma`.
2. `pnpm db:migrate:wasm create <name>` — diffs the **git HEAD** schema against your working-tree schema.
   So always commit a schema change together with its migration, or HEAD will be out of sync.
3. Review the SQL, then `pnpm db:migrate:wasm deploy` and `pnpm db:generate`.

`pnpm install` / `pnpm db:generate` run `scripts/prisma-generate.mjs`, which retries `prisma generate`
without the engine download when it is blocked, so they work in both kinds of environment.

Rules for migration SQL: **no semicolons inside SQL comments** (the WASM runner splits statements on `;`),
and Prisma can't express CHECK constraints, so hand-written ones are appended at the end of migration files.
Never edit a migration that has already been applied/committed — add a new one.

## Folder structure

```
prisma/
  schema.prisma          # data model (read the comments)
  migrations/            # SQL migrations (init has hand-written CHECK constraints at the end)
  seed.ts                # idempotent seed
prisma.config.ts         # Prisma 7 config (datasource URL, seed command)
messages/en.json, ar.json  # ALL user-facing text; keys must match (tested)
scripts/
  check-rules.mjs        # project rule checker (pnpm check:rules), used by hooks and /verify
  screenshots.mjs        # phone/desktop × EN/AR screenshots (pnpm screenshots)
  cloud-setup.sh         # idempotent environment setup
  prisma-wasm.mjs        # migration fallback (see above)
  prisma-generate.mjs    # prisma generate with blocked-engine fallback (postinstall)
src/
  proxy.ts               # optimistic auth redirect only (NOT the security boundary)
  auth.ts                # Auth.js full config (Credentials provider, DB)
  auth.config.ts         # Auth.js edge-safe config shared with proxy (no DB imports)
  app/
    layout.tsx           # <html lang dir>, NextIntlClientProvider, Radix direction, Toaster
    login/               # login page + client form
    (app)/               # protected area: layout = top bar; page.tsx = dashboard ("/")
    api/auth/[...nextauth]/route.ts
  components/
    ui/                  # shadcn/ui components (generated — keep edits minimal and commented)
    top-bar.tsx, language-switch.tsx, direction-provider.tsx
  i18n/                  # locale config + next-intl request config (cookie NEXT_LOCALE)
  lib/
    db.ts                # Prisma client singleton (server-only)
    permissions.ts       # pure role rules (can, canWriteToWarehouse) + tests
    stock/numbering.ts   # entry number prefixes/format (pure) + tests
    validation/          # Zod schemas (shared by client forms and server actions)
    utils.ts             # cn()
  server/
    auth/dal.ts          # getCurrentUser / requireUser / requirePermission / assertCanWriteToWarehouse
    actions/             # server actions ("use server"), one file per area
  generated/prisma/      # Prisma client output (gitignored, built by `prisma generate`)
  types/                 # module augmentation for next-auth and next-intl
tests/
  *.test.ts              # unit: translation parity, rule checker, workflow config
  integration/           # PostgreSQL tests (own <db>_test database, TRUNCATE between tests)
  helpers/db.ts          # testDb, resetDatabase(), makeUser/makeWarehouse/makeProduct
  setup/                 # vitest globalSetup (creates + migrates the test DB)
docs/
  workflow.md            # the AI development workflow
  specs/  plans/         # feature specs (verbatim) and plans (from plans/_template.md)
.claude/                 # agents, slash commands (skills/), hooks, settings.json
```

Put stock business logic in `src/server/stock/` (services that take a Prisma transaction client) and keep pure
helpers in `src/lib/stock/` so they can be unit tested.

## Business rules — must always hold

### The ledger
- **Stock is changed ONLY by saving a `StockEntry` with lines.** Never update `StockLevel` anywhere else —
  no admin "set quantity" screens, no scripts, no seed data. Opening stock is an `IN` entry with reason
  `OPENING_STOCK`; fixing a count is a `CORRECTION_IN`/`CORRECTION_OUT` entry.
- `StockLevel` is a **cache of the ledger** (sum of all entries per product + warehouse). It must always be
  rebuildable from entries.
- `StockEntryLine.quantity` is always a positive integer; the entry `type` gives the direction.
  The DB enforces `quantity > 0` on lines and `quantity >= 0` on `StockLevel` (CHECK constraints).

### Saving an entry — ONE database transaction
Inside a single `db.$transaction(async (tx) => …)`:
1. Get the next number from `Counter` atomically:
   `UPDATE "Counter" SET value = value + 1 WHERE key = $prefix RETURNING value`
   (prefixes: `IN`, `OUT`, `TRF` for transfers, `COR` for corrections, `VOID`), then
   `formatEntryNumber()` from `src/lib/stock/numbering.ts` → `IN-000123`. Never compute numbers with
   `MAX()+1` or outside the transaction.
2. Insert the `StockEntry` and its `StockEntryLine`s (merge duplicate products into one line first).
3. Update `StockLevel` for every line:
   - **Stock coming in:** upsert — `INSERT … ON CONFLICT ("productId","warehouseId") DO UPDATE SET quantity = "StockLevel".quantity + x`.
   - **Stock going out:** conditional update —
     `UPDATE "StockLevel" SET quantity = quantity - x WHERE "productId" = … AND "warehouseId" = … AND quantity >= x`.
     If it affects 0 rows (missing row or not enough stock), **throw and abort the whole transaction**
     — nothing from that entry is saved. Report which product is short.
4. Never read-then-write quantities in JS (`findUnique` → compute → `update`); always let SQL do the
   arithmetic so concurrent saves can't oversell.

### Entries are immutable
- Saved entries are **never edited or deleted** (no `update`/`delete` on `StockEntry`/`StockEntryLine`,
  except setting `voidedAt`/`voidedById` when voiding). Mistakes are fixed by voiding and re-entering.
- **Void (ADMIN only):** in one transaction, create a reverse entry (`type: VOID`, `reason: VOID`,
  `linkedEntryId` = original, same warehouse and lines) that applies the opposite stock change (with the
  same no-negative check), and set `voidedAt`/`voidedById` on the original. An entry can be voided only once,
  and VOID entries themselves cannot be voided. Voiding one half of a transfer voids both halves.

### Transfers
- A transfer saves a linked pair in the **same transaction**: `TRANSFER_OUT` from the source warehouse first,
  then `TRANSFER_IN` to the destination with `linkedEntryId` = the OUT entry's id (one-way link — saved
  entries are never updated to add links). Both `reason: TRANSFER`. Find the IN half of an OUT through
  `linkedFrom` **filtered by `type: TRANSFER_IN`** (VOID entries also link to the entry they reverse).
  Both share one `TRF` counter value: `TRF-000012` (out) and `TRF-000012-IN` (in).
- Source and destination must differ.

### Roles — enforced on the server, every time
- **ADMIN:** everything (all warehouses, cost, void, corrections, products, warehouses, users).
- **STAFF:** create `IN` / `OUT` / `TRANSFER` entries **only in their assigned warehouses**, with two
  exceptions (decided in docs/plans/v1.md):
  - a **transfer** needs only the *source* warehouse assigned; the destination may be any active warehouse;
  - a **damaged customer return** (`CUSTOMER_RETURN` marked damaged) may go into any active `DAMAGED`
    warehouse without assignment — this reason only.
  Cannot see `cost`, cannot void, cannot create corrections, return-to-supplier or damaged/lost entries.
- **VIEWER:** read-only.
- Enforce this **in every server action and route handler**, not just by hiding UI:
  start with `requireUser()` / `requirePermission(action)` from `src/server/auth/dal.ts`, then
  the warehouse checks from `src/lib/stock/policy.ts` for each warehouse touched (source of a transfer;
  the DAMAGED destination of a damaged return is the one exception).
  Pages call `requireUser()` too (layouts don't re-run on every navigation).
- The DAL re-reads role, active flag and warehouses from the DB on each request; never trust the role in
  the JWT/session for authorization.
- Never send `cost` to the client for non-ADMIN users — strip it in the server query
  (`select`), don't just hide the column.
- `src/proxy.ts` is only an optimistic redirect; it is not a security check.

### Text and language
- **All user-facing text goes through next-intl** with keys in both `messages/en.json` and
  `messages/ar.json` (a test fails if the key sets differ). No hard-coded UI strings.
- Zod error messages are translation keys (e.g. `"emailInvalid"`), translated where displayed.
- Arabic is RTL: use logical Tailwind classes (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`,
  `text-start`) instead of `ml-`/`mr-`/`left-`/`right-`; flip directional icons with `rtl:rotate-180`.
  Model codes, emails and numbers in inputs use `dir="ltr"`.
- Product names exist in both languages (`nameEn`, `nameAr`); show the one matching the locale.

## Conventions
- Server actions return `{ ok: true, … } | { ok: false, error: <translation key> }` for expected failures
  and throw for programming errors. Validate input with the same Zod schema the form uses.
- Dates: store `timestamptz`; display in `Asia/Riyadh` (set in next-intl config).
- Money (`cost`) is `Decimal(12,2)` SAR; never use JS floats for arithmetic on it.
- Don't commit `.env`. Add new env vars to `.env.example` with placeholder values.
- shadcn components were copied from the shadcn GitHub registry (the `shadcn` CLI can't reach
  ui.shadcn.com from cloud sessions). If the CLI works for you, `pnpm dlx shadcn@latest add <name>` is fine.
