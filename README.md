# Hamood Stock

Inventory web app for Hamood TV (hamoodtv.com) — stock in, stock out, transfers and corrections across
several warehouses, in English and Arabic. Built with Next.js, PostgreSQL/Prisma and Auth.js.

See **[CLAUDE.md](./CLAUDE.md)** for the stack, folder structure and the business rules every change must follow,
and **[docs/workflow.md](./docs/workflow.md)** for the AI development workflow (`/plan` → `/decide` → `/build` → `/ship`).

## Quick start

Requirements: Node 22+, pnpm 10, PostgreSQL 16.

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

Open http://localhost:3000 and sign in as `admin@hamoodtv.local` with the `SEED_ADMIN_PASSWORD` from `.env`.

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
| `pnpm db:seed` | Idempotent seed: admin, warehouses, sample products, counters |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:migrate:wasm create <name>` / `deploy` | Migration fallback when the Prisma engine download is blocked |
