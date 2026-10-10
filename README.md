# Hamood Stock

Inventory web app for Hamood TV (hamoodtv.com) — stock in, stock out, transfers and corrections across
several warehouses, in English and Arabic. Built with Next.js, PostgreSQL/Prisma and Auth.js.

See **[CLAUDE.md](./CLAUDE.md)** for the stack, folder structure and the business rules every change must follow,
and **[docs/workflow.md](./docs/workflow.md)** for the AI development workflow (`/plan` → `/decide` → `/build` → `/ship`).

## Quick start

Requirements: Node 22+, pnpm 10, PostgreSQL 16 (Neon works too).

**Linux / cloud session (one command):**

```bash
bash scripts/cloud-setup.sh
pnpm dev
```

**Manual (any OS):**

```bash
cp .env.example .env        # then set DATABASE_URL, AUTH_SECRET (openssl rand -base64 32), SEED_ADMIN_PASSWORD
pnpm install
pnpm db:deploy              # apply migrations
pnpm db:seed
pnpm dev
```

Open http://localhost:3000 and sign in as `admin@hamoodtv.local` (or your `SEED_ADMIN_EMAIL`) with the
`SEED_ADMIN_PASSWORD` from `.env`. `.env.example` sets `SEED_SAMPLE_PRODUCTS=true`, so a local database gets a
sample catalogue; stock is always zero until you record entries.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` / `build` / `start` | Next.js dev server / production build / run build |
| `pnpm lint` / `typecheck` / `test` | ESLint / TypeScript / Vitest (unit + integration) |
| `pnpm verify` | Everything: lint, typecheck, tests, rule checker, build |
| `pnpm check:rules` | Project rule checker (ledger, auth, hard deletes, migrations) |
| `pnpm screenshots` | Phone/desktop × EN/AR screenshots of the running app |
| `pnpm db:migrate` | Create + apply a migration (`prisma migrate dev`) |
| `pnpm db:deploy` | Apply pending migrations |
| `pnpm db:seed` | Idempotent seed: first admin, warehouses (Riyadh Main, Damaged Stock), counters; sample products if `SEED_SAMPLE_PRODUCTS=true` |
| `pnpm vercel-build` | What Vercel runs: `prisma migrate deploy` (only when `DIRECT_URL` is set), then `next build` |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:migrate:wasm create <name>` / `deploy` | Migration fallback when the Prisma engine download is blocked |

## Deploy to Vercel + Neon

The app is a normal Next.js app. Stock movements, users and delivery-note photos all live in PostgreSQL,
so the database is the only thing to back up. Nothing is stored on the Vercel server.

### 1. Create the database (Neon)

1. Create a Neon project. Pick the region closest to Riyadh that Neon offers (for example Frankfurt,
   `aws-eu-central-1`), and remember it for step 3.
2. In **Connection details**, copy two connection strings for the main branch:
   - **Pooled** (the host contains `-pooler`). This becomes `DATABASE_URL`, used by the app.
   - **Direct** (turn pooling off). This becomes `DIRECT_URL`, used only for migrations, because migrations
     need a direct connection.

   Both end in `?sslmode=require`. Keep that.

### 2. Create the first admin from your computer (once)

With the repo cloned and `pnpm install` done, run these against the **direct** URL:

```bash
export DATABASE_URL="<Neon DIRECT connection string>"
export DIRECT_URL="$DATABASE_URL"                # so a DIRECT_URL in your local .env can't redirect the migration
pnpm db:deploy                                  # create the tables
SEED_ADMIN_EMAIL="you@hamoodtv.com" \
SEED_ADMIN_PASSWORD="<a strong password, 8+ characters>" \
SEED_SAMPLE_PRODUCTS=false \
pnpm db:seed                                    # first admin + warehouses + counters, no sample products
```

The seed only creates what's missing. It never changes an existing user's password, and it never adds
stock. You can run it again safely.

### 3. Create the Vercel project

1. Import the GitHub repository in Vercel. The framework (Next.js) and pnpm are detected automatically.
2. **Settings → Environment Variables**. Add each one with **only Production ticked**. Vercel ticks
   Preview and Development too by default, so untick them:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon **pooled** connection string |
   | `DIRECT_URL` | Neon **direct** connection string (production deploys apply new migrations with it) |
   | `AUTH_SECRET` | output of `openssl rand -base64 32` (a new value, not your local one) |

   Don't set `AUTH_TRUST_HOST` or the `SEED_*` variables on Vercel. They aren't needed there.
3. **Settings → Functions → Function Region**: choose the same region as the Neon database.
4. Deploy. Vercel runs `pnpm install` (which also generates the Prisma client) and then `pnpm vercel-build`
   (`prisma migrate deploy` on production deployments, then `next build`).
5. Open the site and sign in with the admin email and password from step 2.

**Preview deployments.** With the variables above set for Production only, preview builds fail at
`pnpm install`, because Prisma needs a `DATABASE_URL`. That's safe, but noisy. Pick one:
- Skip preview builds: in **Settings → Git → Ignored Build Step**, use the command
  `[ "$VERCEL_ENV" != "production" ]`. Exit code 0 means Vercel skips the build.
- Give Preview its **own** database. Create a Neon branch, then for **Preview only** set `DATABASE_URL`
  and `DIRECT_URL` to that branch, plus `AUTH_SECRET` and `MIGRATE_ON_BUILD=1` so previews migrate
  their branch.

Preview builds never migrate unless `MIGRATE_ON_BUILD=1`. Never point Preview at the production database.

**Updates.** Merge to the production branch. The deploy applies any new migrations, then builds.
Migrations are only ever added, never edited, so this is safe to repeat.

**Backups.** Neon keeps point-in-time history (how far back depends on the plan). Excel exports
(Reports → Download Excel) are a quick human-readable snapshot.

## Adding users

Users are created by an admin in the app. There is no public sign-up.

1. Sign in as an admin and open **Users → New user**.
2. Enter name, email and a temporary password (8+ characters), and choose a role:
   - **Admin**: everything (all warehouses, unit cost and stock value, void entries, corrections,
     products, warehouses, users).
   - **Staff**: Stock In / Stock Out / transfers in their **assigned warehouses** only. They never see
     cost or value, and can't void.
   - **Viewer**: read-only (stock, entries, reports).
3. For staff, tick the warehouses they work in.
4. Give them the email and temporary password. If someone forgets theirs, use **Reset password** and
   share the new one.
5. When someone leaves, **Deactivate** them. Users, products, warehouses and entries are never deleted,
   so history stays complete. A deactivated user is signed out on their next request.

Before going live, an admin usually adds the real warehouses (**Warehouses**), imports the catalogue
(**Products → Import**), and loads each warehouse's counted stock (**Opening stock**).

