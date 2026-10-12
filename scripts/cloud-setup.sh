#!/usr/bin/env bash
# Idempotent dev-environment setup for Hamood Stock (cloud sessions / fresh Linux boxes).
# Same database as production (Hostinger): MariaDB. Safe to run any number of times:
#   - installs and starts MariaDB if missing
#   - writes .env from .env.example if missing (random AUTH_SECRET, DB password, admin password)
#   - creates the database user and database from DATABASE_URL if missing
#   - pnpm install (also generates the Prisma client), migrations, seed
set -euo pipefail

cd "$(dirname "$0")/.."

log() { printf '\n\033[1;34m[cloud-setup]\033[0m %s\n' "$*"; }

SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

rand() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "${1:-32}"; }
sql_root() { $SUDO mariadb -uroot "$@"; }

# --- 1. MariaDB -------------------------------------------------------------
if ! command -v mariadb >/dev/null 2>&1 || ! command -v mariadbd >/dev/null 2>&1; then
  log "Installing MariaDB"
  $SUDO apt-get update -y || true
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y mariadb-server mariadb-client
fi

if ! $SUDO mariadb-admin ping --silent >/dev/null 2>&1; then
  log "Starting MariaDB"
  $SUDO service mariadb start || $SUDO service mysql start
  for _ in $(seq 1 30); do
    $SUDO mariadb-admin ping --silent >/dev/null 2>&1 && break
    sleep 1
  done
fi
$SUDO mariadb-admin ping

# --- 2. .env ----------------------------------------------------------------
if [ ! -f .env ]; then
  log "Creating .env from .env.example with generated secrets"
  cp .env.example .env
  DB_PASS="$(rand 24)"
  AUTH_SECRET_VAL="$(openssl rand -base64 32)"
  ADMIN_PASS="$(rand 16)"
  # Use | as sed delimiter; generated values contain only [A-Za-z0-9+/=]
  sed -i \
    -e "s|mysql://hamood:CHANGE_ME@|mysql://hamood:${DB_PASS}@|" \
    -e "s|^AUTH_SECRET=.*|AUTH_SECRET=\"${AUTH_SECRET_VAL}\"|" \
    -e "s|^SEED_ADMIN_PASSWORD=.*|SEED_ADMIN_PASSWORD=\"${ADMIN_PASS}\"|" \
    .env
  log "Seed admin password written to .env (SEED_ADMIN_PASSWORD)"
fi
# .env files from the PostgreSQL era: switch DATABASE_URL to MariaDB, keeping user/password/db name.
if grep -qE '^DATABASE_URL="?postgres(ql)?://' .env; then
  log "Switching DATABASE_URL in .env from PostgreSQL to MariaDB"
  sed -i -E 's#^DATABASE_URL="?postgres(ql)?://([^:]+):([^@]+)@([^:/]+)(:[0-9]+)?/([^?"]+)[^"]*"?#DATABASE_URL="mysql://\2:\3@\4:3306/\6"#' .env
  sed -i -E '/^DIRECT_URL=/d' .env
fi
grep -q '^SEED_SAMPLE_PRODUCTS=' .env || echo 'SEED_SAMPLE_PRODUCTS=true' >> .env
grep -q '^AUTO_MIGRATE=' .env || echo 'AUTO_MIGRATE=true' >> .env

# --- 3. Database user + database (taken from DATABASE_URL) -------------------
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
# mysql://USER:PASS@HOST:PORT/DB?params
re='^(mysql|mariadb)://([^:]+):([^@]+)@([^:/]+)(:([0-9]+))?/([^?]+)'
if [[ ! "$DATABASE_URL" =~ $re ]]; then
  echo "Could not parse DATABASE_URL in .env (expected mysql://user:pass@host:3306/db)" >&2
  exit 1
fi
DB_USER="${BASH_REMATCH[2]}"
DB_PASS="${BASH_REMATCH[3]}"
DB_NAME="${BASH_REMATCH[7]}"

if [ "$DB_PASS" = "CHANGE_ME" ]; then
  echo "DATABASE_URL in .env still has the CHANGE_ME placeholder password. Edit .env first." >&2
  exit 1
fi

log "Ensuring user '${DB_USER}' and databases '${DB_NAME}' + '${DB_NAME}_test' exist"
# Values come from our own .env (letters/digits from rand); quote defensively anyway.
q() { printf "%s" "$1" | sed "s/'/''/g"; }
sql_root <<SQL
CREATE DATABASE IF NOT EXISTS \`$(q "$DB_NAME")\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS \`$(q "$DB_NAME")_test\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$(q "$DB_USER")'@'localhost' IDENTIFIED BY '$(q "$DB_PASS")';
ALTER USER '$(q "$DB_USER")'@'localhost' IDENTIFIED BY '$(q "$DB_PASS")';
GRANT ALL PRIVILEGES ON \`$(q "$DB_NAME")\`.* TO '$(q "$DB_USER")'@'localhost';
GRANT ALL PRIVILEGES ON \`$(q "$DB_NAME")_test\`.* TO '$(q "$DB_USER")'@'localhost';
-- The migrator tests create and drop their own scratch database.
GRANT ALL PRIVILEGES ON \`$(q "$DB_NAME")_test_migrator\`.* TO '$(q "$DB_USER")'@'localhost';
FLUSH PRIVILEGES;
SQL

# --- 4. App dependencies, migrations, seed -----------------------------------
log "Installing dependencies (also generates the Prisma client and bundles migrations)"
pnpm install --frozen-lockfile

log "Applying migrations"
pnpm db:deploy

log "Seeding"
pnpm db:seed

log "Done. Start the app with: pnpm dev  (login: admin@hamoodtv.local / SEED_ADMIN_PASSWORD from .env)"
