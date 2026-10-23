# Hamood Stock

Inventory web app for Hamood TV (hamoodtv.com) — stock in, stock out, transfers and corrections across
several warehouses, in English and Arabic. Built with Next.js, MariaDB/Prisma and Auth.js, and hosted
entirely on **Hostinger** (Business web hosting): the app runs as a Node.js web app and the data lives in a
Hostinger MariaDB database. No other service is needed.

See **[CLAUDE.md](./CLAUDE.md)** for the stack, folder structure and the business rules every change must follow,
and **[docs/workflow.md](./docs/workflow.md)** for the AI development workflow (`/plan` → `/decide` → `/build` → `/ship`).

## Quick start (local)

Requirements: Node 22+, pnpm 10, MariaDB 10.6+ (or MySQL 8).

**Linux / cloud session (one command):**

```bash
bash scripts/cloud-setup.sh
pnpm dev
```

**Manual (any OS):**

```bash
cp .env.example .env        # then set DATABASE_URL, AUTH_SECRET (openssl rand -base64 32), SEED_ADMIN_PASSWORD
pnpm install                # also generates the Prisma client and bundles the migrations
pnpm db:deploy              # apply migrations (the server also does this itself when it starts)
pnpm db:seed                # first admin, default warehouses, sample products
pnpm dev
```

Open http://localhost:3000 and sign in as `admin@hamoodtv.local` (or your `SEED_ADMIN_EMAIL`) with the
`SEED_ADMIN_PASSWORD` from `.env`. `.env.example` sets `SEED_SAMPLE_PRODUCTS=true`, so a local database gets a
sample catalogue; stock is always zero until you record entries.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` / `build` / `start` | Next.js dev server / production build (standalone, like Hostinger) / run that standalone server (`.next/standalone/server.js`, reads `.env`). On start the server applies pending migrations and creates the base data (`AUTO_MIGRATE`). |
| `pnpm lint` / `typecheck` / `test` | ESLint / TypeScript / Vitest (unit + integration against MariaDB) |
| `pnpm verify` | Everything: lint, typecheck, tests, rule checker, build |
| `pnpm check:rules` | Project rule checker (ledger, auth, hard deletes, migrations) |
| `pnpm screenshots` | Phone/desktop × EN/AR screenshots of the running app |
| `pnpm db:deploy` | Apply pending migrations to `DATABASE_URL` (same runner the server uses at start-up) |
| `pnpm db:seed` | Base data (counters; default warehouses if none; first admin if no users) + sample products if `SEED_SAMPLE_PRODUCTS=true` |
| `pnpm db:migrate` | Create a migration with `prisma migrate dev` (needs Prisma's native engine — see CLAUDE.md) |
| `pnpm db:studio` | Prisma Studio |

## Deploy to Hostinger

Everything runs on your Hostinger **Business** (or Cloud) plan:

- **The app**: a Node.js web app built from this GitHub repository. Every push to the chosen branch redeploys it.
- **The data**: a MariaDB database in the same hosting account (Hostinger lists it under "MySQL").
- **Set-up and upgrades are automatic**: when the app starts, it creates or updates its own tables
  (migrations), the entry counters, the two default warehouses and, on an empty database only, the first
  admin. There is no command to run on the server.

### 1. Create the database

1. In hPanel open **Websites → (your site) → Dashboard → Databases → Management**.
2. Create a database and a user, e.g. `stock` / `stock`. Hostinger adds your account prefix, so the real
   names look like `u123456789_stock`. Use a long password **made of letters and digits only**, so it
   needs no escaping in the connection string.
3. Write down the full database name, user name and password. The host is `localhost`, port `3306`.

Your connection string is then:

```
mysql://u123456789_stock:THE_PASSWORD@localhost:3306/u123456789_stock
```

### 2. Create the Node.js web app

1. In hPanel go to **Websites → Add website → Node.js web app → Import Git repository**, connect GitHub
   (already done) and choose this repository and the **`main`** branch.
2. Choose the domain for the app. A subdomain such as `stock.hamoodtv.com` keeps it separate from the
   WooCommerce shop.
3. Build settings (Hostinger detects most of them):

   | Setting | Value |
   | --- | --- |
   | Framework / application type | Next.js |
   | Branch | `main` |
   | Node.js version | 22 |
   | Package manager | pnpm (detected from `pnpm-lock.yaml`) |
   | Build script | `build` |
   | Output directory | `.next` (leave as is) |
   | Entry file | leave empty (Hostinger ignores it for Next.js) |

   Hostinger builds Next.js as a *standalone* server and starts it itself. This app already sets
   `output: "standalone"` and copies its static files after the build, so the bundle Hostinger runs is the
   same one tested locally with `pnpm build && pnpm start`.

   Hostinger's build server is too old for Next's fast native compiler (it needs glibc 2.30). So the build
   uses webpack with Next's WebAssembly compiler, which ships in this repo's dependencies. Nothing needs
   downloading during the build. Building takes a little longer, but the app that runs is the same.

4. **Environment variables**: add these. You can also import a file in the same `KEY=value` format.

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the connection string from step 1 |
   | `AUTH_SECRET` | a long random value, e.g. from `openssl rand -base64 32` (keep it secret, never reuse it) |
   | `AUTH_TRUST_HOST` | `true` |
   | `SEED_ADMIN_EMAIL` | the first admin's email, e.g. `you@hamoodtv.com` |
   | `SEED_ADMIN_PASSWORD` | the first admin's password (8+ characters) |

   Leave `SEED_SAMPLE_PRODUCTS` unset in production, so no sample products are added.

5. **Deploy**. When the build finishes, the app starts. Its **Runtime logs** should show:

   ```
   [startup] applied migration 20261010160000_init
   [startup] created warehouses: Riyadh Main, Damaged Stock
   [startup] created the first admin: you@hamoodtv.com
   ```

6. Open the app's address and sign in with that email and password. After that you can delete
   `SEED_ADMIN_PASSWORD` from the environment variables: it is only ever used while the database has no
   users, so it can never create or reset an account later.

### Updates

Merge to `main` and push. Hostinger rebuilds and restarts the app, and the app applies any new migrations
as it starts (logs: `[startup] applied migration …`, or `database schema is up to date`). If a deployment
fails, Hostinger keeps the previous version running, and the build logs and its "AI failure analysis"
show why.

### Backups

All data, including delivery-note photos, is in the database. Hostinger's backups include databases. For
an extra copy, export the database from **Databases → phpMyAdmin → Export**, or use **Reports → Download
Excel** for a readable snapshot.

### Clearing test data before go-live

To start over after testing, without a shell:

1. Take a backup first (**Databases → phpMyAdmin → Export**). The clearing can't be undone.
2. In the app's **Environment variables** add `RESET_TEST_DATA` = any word of 8+ characters (e.g.
   `clear-2026-10-23`) and `RESET_LOGIN_PASSWORD` = a temporary password (8+ characters). Save and restart.
3. At start-up the app deletes all entries, stock, approvals, costs, photos, products, categories, suppliers
   and warehouses (users, settings and the audit log stay), recreates the default categories and the
   Riyadh Main / Damaged Stock warehouses, and starts entry and SKU numbers from 1. The log shows
   `[startup] cleared the test data …`.
4. It also creates one login per role, each with the temporary password, to be changed at first sign-in:
   `admin@`, `manager@` (both warehouses), `staff@` (Riyadh Main), `technician@`, `accountant@`,
   `viewer@` — all `…@hamoodtv.com`. An account that already has one of these emails is left as it is.
5. Remove both variables again. (It runs only once per `RESET_TEST_DATA` value, so a value left behind
   won't clear anything on later restarts — but don't leave the password there.)

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| Runtime log: `DATABASE_URL is not set` / `must start with mysql://` | Check the variable name and the value format in Environment Variables, then redeploy. |
| Runtime log: `Access denied for user` | Wrong user/password, or the user isn't attached to the database. Re-check both in **Databases → Management**. A password with symbols must be URL-encoded (`@` → `%40`), so prefer letters and digits. |
| Runtime log: `no users yet — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD` | Add both variables (password 8+ characters) and redeploy or restart. |
| Runtime log: `Migration … failed earlier and must be fixed by hand` | A migration stopped half-way, which should be rare. MariaDB can't roll back table changes, so a developer must first undo what it already did (the row's `logs` column has the error, `applied_steps_count` how many statements ran), then delete that row from `_prisma_migrations` in phpMyAdmin and restart. On a brand-new install the simplest fix is to drop all tables in the database and restart. |
| Signing in redirects in a loop | `AUTH_TRUST_HOST` must be `true`, and `AUTH_SECRET` must be set. |
| Runtime log: `DATABASE_URL is not a valid URL` | The password contains `@ # / ? :` or a space. URL-encode them, or choose a letters-and-digits password. |
| Runtime log: `warning: … STATEMENT format … using REPEATABLE READ` | The app still works. Hostinger's database logs changes in an older format, so the app uses a slightly weaker read mode. The database constraints still prevent negative stock and double voids. |
| Build log: `Failed to load SWC binary` / `GLIBC_2.29 not found` | `pnpm build` must run `scripts/prepare-wasm-swc.mjs` and `next build --webpack` (it does). Keep `@next/swc-wasm-nodejs` at the same version as `next` when upgrading Next. |
| Build log: `Failed to load next.config.ts` / `Cannot find module '…next.config'` | The config must be `next.config.mjs` (plain JavaScript). Hostinger's config patching breaks a TypeScript config when Next uses its WASM compiler. |
| Build log: `Next.js build produced no standalone server` | `next.config.mjs` must stay plain JavaScript exporting a config object (it does: `withNextIntl({...})`). Don't turn it into a function or back into TypeScript. |
| Build fails with "out of memory" | Retry the deployment. If it keeps failing, the plan's build memory is too small. Check the plan's limits in hPanel. |

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

