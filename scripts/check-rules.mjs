#!/usr/bin/env node
/**
 * Project rule checker — machine-checks the CLAUDE.md rules that ordinary lint can't.
 *
 *   node scripts/check-rules.mjs                 # whole repo (pnpm check:rules)
 *   node scripts/check-rules.mjs --files a.ts b.tsx   # only these files (used by the edit hook)
 *
 * Errors (exit 1):
 *   stocklevel-write   StockLevel written outside src/server/stock/
 *   ledger-mutation    StockEntry / StockEntryLine updated outside src/server/stock/
 *   hard-delete        delete/deleteMany or DELETE FROM on entries, lines, products, users, warehouses
 *   action-auth        an exported server action that never calls the auth DAL
 *   route-auth         a route handler (src/app/**\/route.ts) that never calls the auth DAL
 *   migration-edit     an already-committed migration file was modified
 *   migration-guard    a migration drops the DB-level ledger guards Prisma doesn't know about
 *                      (generated columns voidOfId / transferInOfId and their unique indexes)
 * Warnings (exit 0):
 *   hardcoded-text     JSX text that looks user-facing but isn't going through next-intl
 *
 * Escape hatch: put `// rules-allow: <rule-id> — <why>` on the line itself or the line above.
 * Every escape needs a reason; reviewers (and the ledger-auditor agent) check them.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SCAN_DIRS = ["src", "prisma", "scripts", "tests"];
const SCAN_EXT = /\.(ts|tsx|mts|mjs|js)$/;
const SKIP = [/^src\/generated\//, /^node_modules\//, /^\.next\//, /^prisma\/migrations\//, /(^|\/)fixtures\//];
/** Files that legitimately talk about the patterns (this checker and its tests). */
const SELF = [/^scripts\/check-rules\.mjs$/, /^tests\/check-rules\.test\.ts$/];

const STOCK_SERVICE_DIR = /^src\/server\/stock\//;
const AUTH_CALL = /\b(requireUser|requirePermission|requirePagePermission|requireAdmin|getCurrentUser|routeGuard)\s*\(/;

/** @typedef {{ rule: string, severity: "error" | "warning", file: string, line: number, message: string }} Violation */

function allowed(lines, index, rule) {
  const re = new RegExp(`rules-allow:\\s*${rule}\\b`);
  return re.test(lines[index] ?? "") || re.test(lines[index - 1] ?? "");
}

function lineOf(content, offset) {
  return content.slice(0, offset).split("\n").length;
}

function scanPattern(file, content, regex, rule, message, out, severity = "error") {
  const lines = content.split("\n");
  for (const m of content.matchAll(regex)) {
    const line = lineOf(content, m.index);
    if (allowed(lines, line - 1, rule)) continue;
    out.push({ rule, severity, file, line, message });
  }
}

/** Split a "use server" file into exported functions: [{ name, line, body }]. */
function exportedFunctions(content) {
  const re = /^export\s+(?:async\s+)?function\s+(\w+)|^export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(/gm;
  const starts = [...content.matchAll(re)].map((m) => ({ name: m[1] ?? m[2], index: m.index }));
  return starts.map((s, i) => ({
    name: s.name,
    line: lineOf(content, s.index),
    body: content.slice(s.index, starts[i + 1]?.index ?? content.length),
  }));
}

function isUseServerFile(content) {
  // Directive must be the first statement (comments allowed before it).
  const stripped = content.replace(/^(\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*/, "").trimStart();
  return /^["']use server["']/.test(stripped);
}

/**
 * Check one file. Pure (no fs) so it can be unit tested.
 * @param {string} file repo-relative path with forward slashes
 * @param {string} content
 * @returns {Violation[]}
 */
export function checkFile(file, content) {
  /** @type {Violation[]} */
  const out = [];
  if (SELF.some((r) => r.test(file))) return out;

  if (!STOCK_SERVICE_DIR.test(file)) {
    scanPattern(
      file,
      content,
      /\bstockLevel\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/g,
      "stocklevel-write",
      "StockLevel may only change inside the entry service (src/server/stock/). Save a StockEntry instead.",
      out,
    );
    scanPattern(
      file,
      content,
      /\b(INSERT\s+INTO|REPLACE\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:\\?`|")?StockLevel\b/gi,
      "stocklevel-write",
      "Raw SQL write to StockLevel outside the entry service.",
      out,
    );
    scanPattern(
      file,
      content,
      /\b(stockEntry|stockEntryLine)\s*\.\s*(update|updateMany|upsert)\b/g,
      "ledger-mutation",
      "Saved entries are immutable. Only the entry service may set void fields.",
      out,
    );
    scanPattern(
      file,
      content,
      /\b(UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:\\?`|")?(StockEntry|StockEntryLine)\b/gi,
      "ledger-mutation",
      "Raw SQL update of the ledger outside the entry service.",
      out,
    );
  }

  scanPattern(
    file,
    content,
    /\b(stockEntry|stockEntryLine|product|user|warehouse)\s*\.\s*(delete|deleteMany)\b/g,
    "hard-delete",
    "Never hard-delete entries, products, users or warehouses. Deactivate (active=false) or void instead.",
    out,
  );
  scanPattern(
    file,
    content,
    /\bDELETE\s+FROM\s+"(StockEntry|StockEntryLine|Product|User|Warehouse)"/gi,
    "hard-delete",
    "Never hard-delete entries, products, users or warehouses.",
    out,
  );

  if (/\.(ts|tsx)$/.test(file) && file.startsWith("src/") && isUseServerFile(content)) {
    const lines = content.split("\n");
    for (const fn of exportedFunctions(content)) {
      if (AUTH_CALL.test(fn.body)) continue;
      if (allowed(lines, fn.line - 1, "action-auth")) continue;
      out.push({
        rule: "action-auth",
        severity: "error",
        file,
        line: fn.line,
        message: `Server action "${fn.name}" must call requireUser()/requirePermission() (src/server/auth/dal.ts).`,
      });
    }
  }

  if (/^src\/app\/.*\/route\.(ts|tsx)$/.test(file) && !/^src\/app\/api\/auth\//.test(file)) {
    const lines = content.split("\n");
    const allowedFile = lines.some((l) => /rules-allow:\s*route-auth\b/.test(l));
    if (!AUTH_CALL.test(content) && !allowedFile) {
      out.push({
        rule: "route-auth",
        severity: "error",
        file,
        line: 1,
        message: "Route handler must check the user with getCurrentUser()/requirePermission().",
      });
    }
  }

  if (/^src\/(app|components)\/.*\.tsx$/.test(file) && !/^src\/components\/ui\//.test(file)) {
    const lines = content.split("\n");
    // Text directly between a closing `>` and the next `<`, outside {expressions}.
    const re = />([^<>{}]*[A-Za-z؀-ۿ]{2,}[^<>{}]*)</g;
    for (const m of content.matchAll(re)) {
      const text = m[1].trim();
      // Skip TypeScript accidentally matched: `=> Promise<…>`, generics, parameter lists.
      if (content[m.index - 1] === "=") continue;
      if (!text || /[=;()]/.test(text) || /^(\||&)/.test(text)) continue;
      const openerAfter = content[m.index + m[0].length] ?? "";
      if (/[A-Za-z_]$/.test(m[1]) && /[A-Za-z_]/.test(openerAfter)) continue; // `Extract<T>`, `Promise<X>`
      const line = lineOf(content, m.index);
      if (allowed(lines, line - 1, "hardcoded-text")) continue;
      out.push({
        rule: "hardcoded-text",
        severity: "warning",
        file,
        line,
        message: `Possible hard-coded UI text "${text.slice(0, 40)}" — use next-intl (messages/en.json + ar.json).`,
      });
    }
  }

  return out;
}

function listFiles() {
  const files = [];
  const walk = (dir) => {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (SKIP.some((r) => r.test(rel + (entry.isDirectory() ? "/" : "")))) continue;
      if (entry.isDirectory()) walk(rel);
      else if (SCAN_EXT.test(entry.name)) files.push(rel);
    }
  };
  SCAN_DIRS.forEach(walk);
  return files;
}

/** Committed migration files that differ from HEAD (applied migrations must never change). */
export function changedCommittedMigrations(root = ROOT) {
  try {
    const changed = execFileSync("git", ["diff", "--name-only", "HEAD", "--", "prisma/migrations"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .filter(Boolean);
    return changed.filter((f) => {
      try {
        execFileSync("git", ["cat-file", "-e", `HEAD:${f}`], { cwd: root, stdio: "ignore" });
        return true; // existed in HEAD → it was modified or deleted
      } catch {
        return false; // new file
      }
    });
  } catch {
    return []; // not a git repo / no HEAD
  }
}

/** Names of the hand-written ledger guards (prisma/migrations/20261010160000_init). Prisma doesn't model
 * them, so a migration it generates may try to drop them — that must never be committed. */
const LEDGER_GUARDS = /\bDROP\s+(?:INDEX|COLUMN|CONSTRAINT|CHECK)\s+(?:IF\s+EXISTS\s+)?`?(voidOfId|transferInOfId|StockEntry_one_void_per_entry|StockEntry_one_transfer_in_per_out|StockEntry_void_type_reason|StockLevel_quantity_non_negative|StockEntryLine_quantity_positive|Counter_value_non_negative)`?/gi;

/** @returns {Violation[]} */
export function checkMigrationSql(file, content) {
  const out = [];
  for (const m of content.matchAll(LEDGER_GUARDS)) {
    out.push({
      rule: "migration-guard",
      severity: "error",
      file,
      line: lineOf(content, m.index ?? 0),
      message: `This migration drops the ledger guard ${m[1]}. Prisma doesn't know about it — delete this line from the migration.`,
    });
  }
  return out;
}

function migrationSqlFiles(root = ROOT) {
  const dir = path.join(root, "prisma", "migrations");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, "migration.sql")))
    .map((d) => `prisma/migrations/${d.name}/migration.sql`);
}

function main() {
  const args = process.argv.slice(2);
  const filesFlag = args.indexOf("--files");
  const files =
    filesFlag >= 0
      ? args
          .slice(filesFlag + 1)
          .map((f) => path.relative(ROOT, path.resolve(f)).split(path.sep).join("/"))
          .filter((f) => SCAN_EXT.test(f) && !SKIP.some((r) => r.test(f)) && fs.existsSync(path.join(ROOT, f)))
      : listFiles();

  /** @type {Violation[]} */
  const violations = files.flatMap((f) => checkFile(f, fs.readFileSync(path.join(ROOT, f), "utf8")));

  if (filesFlag < 0) {
    for (const f of migrationSqlFiles()) violations.push(...checkMigrationSql(f, fs.readFileSync(path.join(ROOT, f), "utf8")));
    for (const f of changedCommittedMigrations()) {
      violations.push({
        rule: "migration-edit",
        severity: "error",
        file: f,
        line: 1,
        message: "Committed migrations are immutable. Revert this change and create a new migration.",
      });
    }
  }

  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");
  for (const v of [...errors, ...warnings]) {
    const tag = v.severity === "error" ? "ERROR" : "warn ";
    console.log(`${tag} ${v.file}:${v.line} [${v.rule}] ${v.message}`);
  }
  console.log(
    `check-rules: ${files.length} files, ${errors.length} error(s), ${warnings.length} warning(s)`,
  );
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
