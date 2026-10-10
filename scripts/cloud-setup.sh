#!/usr/bin/env bash
# Idempotent dev-environment setup for Hamood Stock (cloud sessions / fresh Linux boxes).
# Safe to run any number of times:
#   - installs and starts PostgreSQL if missing
#   - writes .env from .env.example if missing (random AUTH_SECRET, DB password, admin password)
#   - creates the database role and database from DATABASE_URL if missing
#   - pnpm install, prisma generate, prisma migrate deploy, seed
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

log() { printf '\n\033[1;34m[cloud-setup]\033[0m %s\n' "$*"; }

SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

as_postgres() {
  if [ "$(id -u)" -eq 0 ]; then
    runuser -u postgres -- "$@"
  else
    sudo -u postgres "$@"
  fi
}

rand() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "${1:-32}"; }

# --- 1. PostgreSQL ----------------------------------------------------------
if ! command -v psql >/dev/null 2>&1 || ! command -v pg_lsclusters >/dev/null 2>&1; then
  log "Installing PostgreSQL"
  $SUDO apt-get update -y
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y postgresql postgresql-contrib
fi

if ! as_postgres pg_isready -q -h localhost 2>/dev/null; then
  log "Starting PostgreSQL"
  $SUDO service postgresql start || {
    # Fallback for environments without service wrappers
    for cluster in $(pg_lsclusters -h | awk '{print $1"/"$2}'); do
      $SUDO pg_ctlcluster "${cluster%/*}" "${cluster#*/}" start || true
    done
  }
  for _ in $(seq 1 30); do
    as_postgres pg_isready -q -h localhost && break
    sleep 1
  done
fi
as_postgres pg_isready -h localhost

# --- 2. .env ----------------------------------------------------------------
if [ ! -f .env ]; then
  log "Creating .env from .env.example with generated secrets"
  cp .env.example .env
  DB_PASS="$(rand 24)"
  AUTH_SECRET_VAL="$(openssl rand -base64 32)"
  ADMIN_PASS="$(rand 16)"
  # Use | as sed delimiter; generated values contain only [A-Za-z0-9+/=]
  sed -i \
    -e "s|postgresql://hamood:CHANGE_ME@|postgresql://hamood:${DB_PASS}@|" \
    -e "s|^AUTH_SECRET=.*|AUTH_SECRET=\"${AUTH_SECRET_VAL}\"|" \
    -e "s|^SEED_ADMIN_PASSWORD=.*|SEED_ADMIN_PASSWORD=\"${ADMIN_PASS}\"|" \
    .env
  log "Seed admin password written to .env (SEED_ADMIN_PASSWORD)"
fi

# --- 3. Database role + database (taken from DATABASE_URL) -----------------
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
# postgresql://USER:PASS@HOST:PORT/DB?params
re='^postgres(ql)?://([^:]+):([^@]+)@([^:/]+)(:([0-9]+))?/([^?]+)'
if [[ ! "$DATABASE_URL" =~ $re ]]; then
  echo "Could not parse DATABASE_URL in .env" >&2
  exit 1
fi
DB_USER="${BASH_REMATCH[2]}"
DB_PASS="${BASH_REMATCH[3]}"
DB_NAME="${BASH_REMATCH[7]}"

if [ "$DB_PASS" = "CHANGE_ME" ]; then
  echo "DATABASE_URL in .env still has the CHANGE_ME placeholder password. Edit .env first." >&2
  exit 1
fi

log "Ensuring role '${DB_USER}' and database '${DB_NAME}' exist"
as_postgres psql -v ON_ERROR_STOP=1 -q -d postgres \
  -v db_user="$DB_USER" -v db_pass="$DB_PASS" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'db_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'db_user') \gexec
-- Keep password in sync with .env; CREATEDB is needed for Prisma's shadow database (migrate dev)
SELECT format('ALTER ROLE %I WITH LOGIN CREATEDB PASSWORD %L', :'db_user', :'db_pass') \gexec
SQL

as_postgres psql -v ON_ERROR_STOP=1 -q -d postgres \
  -v db_user="$DB_USER" -v db_name="$DB_NAME" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name') \gexec
SQL

# --- 4. App dependencies, migrations, seed -----------------------------------
# The Prisma CLI downloads a native schema-engine from binaries.prisma.sh. Some sandboxes
# block that host; then migrations run on the WASM engine (scripts/prisma-wasm.mjs) and
# `pnpm db:generate` (scripts/prisma-generate.mjs) skips the engine download by itself.
USE_WASM_ENGINE=0
PRISMA_BIN_STATUS="$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' https://binaries.prisma.sh/ 2>/dev/null || true)"
if [ -z "$PRISMA_BIN_STATUS" ] || [ "$PRISMA_BIN_STATUS" = "000" ]; then
  USE_WASM_ENGINE=1
  log "binaries.prisma.sh unreachable — using the WASM schema engine for migrations"
fi

log "Installing dependencies"
pnpm install --frozen-lockfile

log "Generating Prisma client"
pnpm db:generate

log "Applying migrations"
if [ "$USE_WASM_ENGINE" = "1" ]; then
  pnpm db:migrate:wasm deploy
else
  pnpm exec prisma migrate deploy
fi

log "Seeding"
pnpm db:seed

log "Done. Start the app with: pnpm dev  (login: admin@hamoodtv.local / SEED_ADMIN_PASSWORD from .env)"
