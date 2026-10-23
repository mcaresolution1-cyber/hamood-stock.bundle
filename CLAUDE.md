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
| Database | MariaDB 10.6+ (Hostinger; MySQL 8 also works) + Prisma 7 (`prisma-client` generator, `@prisma/adapter-mariadb`) |
| Hosting | Hostinger Business web hosting: Node.js web app from GitHub + Hostinger MariaDB — nothing else |
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
pnpm build            # production build like Hostinger's: webpack + WASM compiler, output standalone, static assets copied
pnpm start            # run .next/standalone/server.js with .env — the same server Hostinger runs
pnpm lint             # ESLint
pnpm typecheck        # next typegen + tsc --noEmit
pnpm test             # Vitest: unit + integration (integration needs MariaDB)
pnpm db:migrate       # prisma migrate dev (create a migration — needs the native engine, see below)
pnpm db:deploy        # apply pending migrations with our runner (the server also does this at start-up)
pnpm db:seed          # idempotent seed (base data + sample products if SEED_SAMPLE_PRODUCTS=true)
pnpm db:studio        # Prisma Studio
pnpm db:generate      # regenerate the Prisma client (also runs on pnpm install)
pnpm setup:cloud      # = bash scripts/cloud-setup.sh (see below)
pnpm test:unit        # unit tests only (no database needed)
pnpm test:integration # MariaDB tests against <db>_test (created + migrated automatically)
pnpm check:rules      # project rule checker (ledger, auth, hard deletes, migrations, i18n)
pnpm verify           # lint + typecheck + all tests + check:rules + build
pnpm screenshots      # phone/desktop × EN/AR screenshots of the running app → docs/screenshots/
```

Deploying to Hostinger, the first admin and adding users: see **README.md**.

Before finishing any change run `pnpm verify`.

### Fresh cloud session / new machine

Run `bash scripts/cloud-setup.sh`. It is idempotent: installs/starts MariaDB, writes `.env` from
`.env.example` (random `AUTH_SECRET`, DB password and `SEED_ADMIN_PASSWORD`) if missing (and converts an old
PostgreSQL `DATABASE_URL`), creates the DB user + `<db>` and `<db>_test`, then `pnpm install`, migrations and seed.
Log in as `admin@hamoodtv.local` with `SEED_ADMIN_PASSWORD` from `.env`.
Env: `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` create the first admin only while there are no users at all;
`SEED_SAMPLE_PRODUCTS=true` adds the sample catalogue (dev only); `AUTO_MIGRATE=false` skips start-up migrations.

### Database: MariaDB, migrations and start-up

Production is Hostinger (README → Deploy): MariaDB at `localhost`, no shell step for migrations. So:

- **The server migrates itself.** `src/instrumentation.ts` → `src/server/db/bootstrap.ts` runs once per
  server start: `applyMigrations` (`src/server/db/migrator.ts`, a MariaDB named lock + Prisma's own
  `_prisma_migrations` table and checksums) over the SQL embedded at install/build time
  (`scripts/bundle-migrations.mjs` → `src/generated/migrations.ts`), then `ensureBaseData`
  (`src/server/db/base-data.ts`: counters; default warehouses only if none; first admin only if NO users).
  `pnpm db:deploy` (scripts/migrate.ts) and the test setup use the same runner.
- **Connections** (`src/lib/db-config.ts`): every session runs `time_zone = '+00:00'` and
  `READ COMMITTED` — the stock/void/admin checks lock a row and then must see the latest committed data.
  Keep the pool small (shared hosting limits connections). `src/lib/db.ts` creates the client lazily, so
  `next build` needs no database.
- **Creating a migration.** `prisma migrate dev` needs Prisma's native schema engine (downloaded from
  binaries.prisma.sh, which cloud sessions block; Prisma's WASM engine has no MySQL support). Where it works:
  edit `prisma/schema.prisma`, `pnpm db:migrate` (or `prisma migrate diff --from-migrations … --script`).
  In a blocked session, write the SQL by hand in Prisma's MySQL style (backtick identifiers, `DATETIME(3)`,
  `VARCHAR(191)`, `DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`) into a new
  `prisma/migrations/<UTC timestamp>_<name>/migration.sql`, then `pnpm db:generate && pnpm db:deploy`.
  Commit the schema change together with its migration.
- **Rules for migration SQL:** no semicolons inside comments (statements are split on `;` at line end);
  CHECK constraints and the generated-column unique guards are hand-written at the end of the file;
  never edit a committed migration — add a new one. Prisma doesn't know the guards (`voidOfId`,
  `transferInOfId` + their unique indexes), so a migration it generates may try to DROP them: delete those
  lines (`pnpm check:rules` → `migration-guard` blocks them).
- **Isolation fallback:** if the server logs binary changes in STATEMENT format, MariaDB refuses writes under
  READ COMMITTED; start-up detects it and uses REPEATABLE READ (warning in the logs). The DB constraints
  (no negative stock, one void per entry) still hold.
- **SQL in code** is MariaDB: backtick identifiers, `LOCK IN SHARE MODE` (not FOR SHARE),
  `ON DUPLICATE KEY UPDATE`, `LAST_INSERT_ID(expr)` for the counter (no RETURNING), no partial indexes
  (use a generated column + unique index), case-insensitive matching comes from the `utf8mb4_unicode_ci`
  collation (Prisma's `mode: "insensitive"` is Postgres-only).

### Building for Hostinger (old glibc)

Hostinger's build server has glibc < 2.30, so Next's native compiler (`@next/swc-linux-x64-gnu`) and
Turbopack can't run there. `pnpm build` therefore runs `next build --webpack` with Next's WASM compiler:
`scripts/prepare-wasm-swc.mjs` copies the `@next/swc-wasm-nodejs` devDependency to `<next>/wasm/…`, where
Next looks before trying a download (which fails on Hostinger). **When upgrading `next`, bump
`@next/swc-wasm-nodejs` to the same version** (the script fails the build if they differ). Tailwind runs
through `postcss.config.mjs` (`@tailwindcss/postcss`) in both dev (Turbopack) and build (webpack). Every
other native binary in the build needs glibc ≤ 2.17. The Next config is **`next.config.mjs` (plain JS) — never
`next.config.ts`**: Hostinger renames the config and imports it from a wrapper to force standalone output,
and with the WASM compiler a TypeScript config then fails (`Cannot find module '…/<hash>.next.config'`).

`pnpm install` / `pnpm db:generate` run `scripts/prisma-generate.mjs` (prisma generate with a fallback when the
engine download is blocked) and then bundle the migrations.

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
  migrate.ts             # pnpm db:deploy (same runner as start-up)
  bundle-migrations.mjs  # embed migrations for the server (install + build)
  prepare-wasm-swc.mjs   # make Next's WASM compiler available offline (Hostinger build)
  standalone-assets.mjs  # copy .next/static + public next to the standalone server
  prisma-generate.mjs    # prisma generate with blocked-engine fallback (postinstall)
src/
  proxy.ts               # optimistic auth redirect only (NOT the security boundary)
  auth.ts                # Auth.js full config (Credentials provider, DB)
  auth.config.ts         # Auth.js edge-safe config shared with proxy (no DB imports)
  app/
    layout.tsx           # <html lang dir>, NextIntlClientProvider, Radix direction, Toaster
    not-found.tsx        # unknown URLs
    login/               # login page + client form
    (app)/               # protected area: layout = top bar; page.tsx = dashboard ("/")
      loading.tsx, error.tsx, not-found.tsx   # skeleton / translated error (retry) / 404 inside the app
      stock/in, stock/out                     # entry wizard pages
      entries/, entries/[id]/                 # entry list, detail (+ void dialog)
      products/[id]/                          # product page: stock per warehouse + stock card
      reports/<name>/page.tsx + export/route.ts   # 4 reports, each with an Excel export of the same rows
      admin/                                  # products (+ import, export), suppliers, warehouses, users, opening stock, audit, settings
      approvals/, jobs/, account/password/    # approval requests, technician jobs, own password
    print/entries/[id]/  # printable bilingual A4 delivery note (outside the app layout)
    api/attachments/[id] # delivery-note photos (auth-checked)
    api/product-images/[id] # product photos (?size=thumb), stored in MariaDB
    api/auth/[...nextauth]/route.ts
  components/
    ui/                  # shadcn/ui components (generated — keep edits minimal and commented)
    top-bar.tsx, language-switch.tsx, direction-provider.tsx
    stock/               # entry wizard, product picker, quantity stepper, photo input
    reports/             # ReportTable (tanstack v9, sort keys), tabs, report bar, category filter
    page-skeleton.tsx, error-view.tsx, not-found-view.tsx, empty-state.tsx
  i18n/                  # locale config + next-intl request config (cookie NEXT_LOCALE)
  lib/
    db.ts                # Prisma client (lazy singleton, server-only)
    db-config.ts         # MariaDB connection settings from DATABASE_URL (UTC, READ COMMITTED, small pool)
    permissions.ts       # pure role rules (can, canWriteToWarehouse) + tests
    stock/numbering.ts   # entry number prefixes/format (pure) + tests
    validation/          # Zod schemas (shared by client forms and server actions)
    utils.ts             # cn()
  server/
    auth/dal.ts          # getCurrentUser / requireUser / requirePermission / assertCanWriteToWarehouse
    actions/             # server actions ("use server"), one file per area
    stock/               # createEntry / voidEntry — the ONLY code that changes StockLevel
    queries/             # reads: entries, reports, product-stock, dashboard, … (cost only for cost:view)
    export/              # xlsx writer + report exports + routeGuard
    db/                  # start-up: migrator, base data, bootstrap (called from src/instrumentation.ts)
  generated/prisma/      # Prisma client output (gitignored, built by `prisma generate`)
  types/                 # module augmentation for next-auth and next-intl
tests/
  *.test.ts              # unit: translation parity, rule checker, workflow config
  integration/           # MariaDB tests (own <db>_test database, TRUNCATE between tests)
  helpers/db.ts          # testDb, resetDatabase(), makeUser/makeWarehouse/makeProduct
  setup/                 # vitest globalSetup (creates + migrates the test DB)
docs/
  workflow.md            # the AI development workflow
  specs/  plans/         # feature specs (verbatim) and plans (from plans/_template.md)
.claude/                 # agents, slash commands (skills/), hooks, settings.json
```

Put stock business logic in `src/server/stock/` (services that take a Prisma transaction client) and keep pure
helpers in `src/lib/stock/` so they can be unit tested.

### Building blocks (use these, don't re-invent them)
| Need | Use |
| --- | --- |
| Save any stock movement | `createEntry(db, user, input)` / `createEntryInTx(tx, …)` in `src/server/stock/createEntry.ts` |
| Save a form that may need approval | `submitEntry` / `submitVoid` (`src/server/stock/approvals.ts`) → `{ status: "saved" \| "voided" \| "pending" }`. Corrections, damaged/lost and voids above the limits in Settings become an `ApprovalRequest`; `createEntryInTx`/`voidEntryInTx` throw `ApprovalRequiredError` otherwise. Approve/reject with `decideRequest` |
| Audit a change | `audit(tx, actorId, { action, subjectType, … })` + `changedFields(before, after)` (`src/server/audit.ts`) in the SAME transaction as the change; never pass hashes or photos |
| App settings | `src/lib/settings.ts` (schemas, defaults) + `src/server/settings.ts` (read/write the `Setting` table) |
| Product status rules | `canReceive` / `canMove` / `isReordered` (`src/lib/products.ts`, decision PB1) — ACTIVE / DISCONTINUED / INACTIVE; never filter on a boolean `active` for products |
| Low stock | `lowStockOf` (`src/lib/stock/low-stock.ts`): per-warehouse reorder levels first, else the product's default level; only ACTIVE products |
| Product photos | `uploadProductImage` (browser-resized 800 px + 240 px thumb) → `Product.imageUrl = /api/product-images/<id>`; show with `ProductThumb` (uses the thumbnail) |
| Supplier on an entry | `supplierId` from `SupplierPicker` (`src/components/stock/supplier-picker.tsx`); `saveEntry` checks it is active and stores its name in `supplierName` |
| Who may use which reason / warehouse | `src/lib/stock/policy.ts` (`entryPermissionError`, `formReasons`, `entryTypeFor`) |
| Server action shape | `guarded(async () => { await requirePermission(…); schema.parse(input); … })` → `ActionResult` (`src/server/actions/result.ts`); throw `UserFacingError(key)` for expected failures |
| Page access | `requireUser()` or `requirePagePermission(action)` (redirects to `/?denied=1`) |
| Route handler access | `routeGuard(action)` (`src/server/export/template.ts`) → 401/403 |
| Read product data | `src/server/queries/*` — select `cost` only when `can(role, "cost:view")` |
| Spreadsheet upload | `readSheet(file)` (xlsx/csv, 2 MB, 2,000 rows) + a pure validator in `src/lib/import/` |
| Forms | RHF + `zodResolver(schema)`, `TextField`/`SelectField`/`applyActionErrors` (`src/components/form-fields.tsx`); translate keys with `useMessage()` |
| Lists on phones | `ResponsiveList` + `MobileCard` (cards < md, table ≥ md); LTR text in RTL with `<Ltr>` |
| Report screen + export | a query in `src/server/queries/reports.ts` returning plain rows, used by BOTH the page (`ReportTable`) and the export (`src/server/export/reports.ts` → `xlsxFile`); never compute rows twice |
| URL filters | `parseEntryFilters`, `isValidDay`, `parsePage` (`src/server/queries/entries.ts`) — ignore bad values, never throw |
| Loading / errors | `loading.tsx` → `PageSkeleton`; `error.tsx` → `ErrorView` (Next 16.4 passes `retry`, not `reset`); `notFound()` → translated 404 |
| Confirm + run an action | `ConfirmAction` (`src/components/confirm-action.tsx`) |
| Call a server action from the browser | **always** `runAction(() => action(…), { retry })` (`src/lib/run-action.ts`): network failures, redeploys and server bugs become a toast instead of the error page, the form keeps its data. `retry: true` only for actions safe to repeat (updates, previews, login, stock entries with an idempotency key) — never for creates/imports |
| Repeat-submit protection | `idempotencyKey` on `createEntry` input (unique on `StockEntry`): the same key returns the entry already saved. The wizard keeps one key per Review screen |
| Language switch | plain link to `/locale?l=ar&next=…` (`src/app/locale/route.ts`, relative redirect via `safeNextPath`) — not a server action |
| Test fixtures / ledger check | `tests/helpers/db.ts`, `tests/helpers/ledger.ts` (`expectLedgerMatchesLevels`), `tests/helpers/auth.ts` (`signInAs`) |

Races: checks that must hold at write time (stock before deactivating a warehouse, last admin, opening-stock
confirmation) run **inside** a transaction with a row lock (`FOR UPDATE`) — see warehouses/users/opening-stock
actions for the pattern.
Lock order in a save: sale `StockEntry` rows (customer returns, `FOR UPDATE`) → warehouse (S) → products (S,
sorted) → `StockLevel`. A void locks its entry row first, then the same order. Customer returns lock the sale
rows **before** reading `voidedAt` (`src/server/stock/returns.ts`). Unit costs live in `LineCost`, never on lines.

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
   ``UPDATE `Counter` SET value = LAST_INSERT_ID(value + 1) WHERE `key` = ?`` then `SELECT LAST_INSERT_ID()`
   on the same (transaction) connection
   (prefixes: `IN`, `OUT`, `TRF` for transfers, `COR` for corrections, `VOID`; `REQ` numbers approval requests), then
   `formatEntryNumber()` from `src/lib/stock/numbering.ts` → `IN-000123`. Never compute numbers with
   `MAX()+1` or outside the transaction.
2. Insert the `StockEntry` and its `StockEntryLine`s (merge duplicate products into one line first).
3. Update `StockLevel` for every line:
   - **Stock coming in:** upsert — `INSERT … ON DUPLICATE KEY UPDATE quantity = quantity + x`.
   - **Stock going out:** conditional update —
     `UPDATE StockLevel SET quantity = quantity - x WHERE productId = … AND warehouseId = … AND quantity >= x`.
     If it affects 0 rows (missing row or not enough stock), **throw and abort the whole transaction**
     — nothing from that entry is saved. Report which product is short.
4. Never read-then-write quantities in JS (`findUnique` → compute → `update`); always let SQL do the
   arithmetic so concurrent saves can't oversell.

### Entries are immutable
- Saved entries are **never edited or deleted** (no `update`/`delete` on `StockEntry`/`StockEntryLine`,
  except setting `voidedAt`/`voidedById` when voiding). Mistakes are fixed by voiding and re-entering.
- **Void (ADMIN, or MANAGER in his warehouses — above the approval limit through a request):** in one transaction, create a reverse entry (`type: VOID`, `reason: VOID`,
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
The table is `ROLE_ACTIONS` in `src/lib/permissions.ts` (decisions PA1–PA3 in docs/plans/v2.md).
- **ADMIN:** everything (all warehouses, cost, void, corrections, opening stock, products, warehouses,
  users, settings, audit log). Never needs approval.
- **MANAGER:** every stock reason except opening stock — including corrections, damaged/lost, return to
  supplier and voids — **only in assigned warehouses** (both warehouses for a transfer void); approves
  requests for those warehouses; manages suppliers. No cost, no products/warehouses/users/settings.
- **STAFF:** create `IN` / `OUT` / `TRANSFER` entries **only in their assigned warehouses**, and *request*
  corrections and damaged/lost there (approval rules decide), with two exceptions (docs/plans/v1.md):
  - a **transfer** needs only the *source* warehouse assigned; the destination may be any active warehouse;
  - a **broken customer return** (`CUSTOMER_RETURN` marked broken) may go into any active `DAMAGED`
    warehouse without assignment — this reason only. (Broken returns may also go into the user's own
    sellable warehouses; resellable ones only there.)
  A customer return marked **trashed** goes into a `DAMAGED` warehouse the same way and is written off at
  once by a linked damaged/lost entry (`RETURNED_TRASHED`) without approval — it can't exceed what was sold,
  and voiding either entry voids both (docs/plans/channels-returns.md).
  Cannot see `cost`, cannot void, cannot use return-to-supplier.
- **TECHNICIAN:** only his own installation jobs (`/jobs`).
- **ACCOUNTANT:** read-only, plus cost and the audit log.
- **VIEWER:** read-only.
- **Approvals:** nothing reaches the ledger until approved; nobody decides his own request; a MANAGER
  decides only requests whose warehouses are all assigned to him.
- **Sign-in:** new users and admin resets must change their password first (`requireUser` redirects to
  `/account/password`); sessions end after 8 h idle / 24 h, and on a password change; sign-in attempts are
  limited per email and IP (`src/server/auth/login-limits.ts`).
- Enforce this **in every server action and route handler**, not just by hiding UI:
  start with `requireUser()` / `requirePermission(action)` from `src/server/auth/dal.ts`, then
  the warehouse checks from `src/lib/stock/policy.ts` for each warehouse touched (source of a transfer;
  the DAMAGED destination of a damaged return is the one exception).
  Pages call `requireUser()` too (layouts don't re-run on every navigation).
- The DAL re-reads role, active flag and warehouses from the DB on each request; never trust the role in
  the JWT/session for authorization.
- Never send `cost` to the client for roles without `cost:view` (only ADMIN and ACCOUNTANT) — strip it in the server query
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
- Dates: stored as UTC `DATETIME(3)` (sessions run in UTC); display in `Asia/Riyadh` (set in next-intl config).
  Day/month filters are Riyadh days (`riyadhDayStart`); SQL month buckets add `INTERVAL 3 HOUR` (Riyadh is
  UTC+3 all year) — no named time zones, Hostinger's MariaDB may not have the tz tables.
- Phones: interactive controls are ≥ 44px tall below `md` (Button/Input/Select sizes are set that way in
  `src/components/ui` — don't override them with a smaller `h-*` without an `md:` prefix).
- Excel: text is written as plain text cells, never formulas (decision B13); keep exports .xlsx, not CSV.
- Money (`cost`) is `Decimal(12,2)` SAR; never use JS floats for arithmetic on it.
- Don't commit `.env`. Add new env vars to `.env.example` with placeholder values.
- shadcn components were copied from the shadcn GitHub registry (the `shadcn` CLI can't reach
  ui.shadcn.com from cloud sessions). If the CLI works for you, `pnpm dlx shadcn@latest add <name>` is fine.
