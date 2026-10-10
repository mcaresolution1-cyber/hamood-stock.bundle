/**
 * Guards the Claude Code workflow in .claude/ — a broken agent or hook file is silently ignored by
 * Claude Code, so we check the structure here instead.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

function frontmatter(content: string): Record<string, string> {
  const m = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return {};
  return Object.fromEntries(
    m[1]
      .split("\n")
      .map((l) => l.match(/^([A-Za-z-]+):\s*(.*)$/))
      .filter((x): x is RegExpMatchArray => Boolean(x))
      .map((x) => [x[1], x[2].trim()]),
  );
}

const agentFiles = fs.readdirSync(path.join(ROOT, ".claude/agents")).filter((f) => f.endsWith(".md"));
const skillDirs = fs.readdirSync(path.join(ROOT, ".claude/skills"));
const agentNames = agentFiles.map((f) => frontmatter(read(`.claude/agents/${f}`)).name);

describe("agents", () => {
  it.each(agentFiles)("%s has a valid name and description", (file) => {
    const fm = frontmatter(read(`.claude/agents/${file}`));
    expect(fm.name).toBe(file.replace(/\.md$/, ""));
    expect(fm.name).not.toContain(":");
    expect(fm.description?.length ?? 0).toBeGreaterThan(40);
  });

  it("includes the full workflow cast", () => {
    expect(agentNames.sort()).toEqual(
      ["cross-examiner", "implementer", "ledger-auditor", "planner", "test-engineer", "ui-verifier"].sort(),
    );
  });

  it("keeps reviewers read-only", () => {
    for (const name of ["cross-examiner", "ledger-auditor"]) {
      const tools = frontmatter(read(`.claude/agents/${name}.md`)).tools ?? "";
      expect(tools).not.toMatch(/\b(Edit|Write)\b/);
    }
  });
});

describe("commands", () => {
  it.each(skillDirs)("/%s has a description", (dir) => {
    const fm = frontmatter(read(`.claude/skills/${dir}/SKILL.md`));
    expect(fm.description?.length ?? 0).toBeGreaterThan(20);
  });

  it("only delegates to agents that exist", () => {
    for (const dir of skillDirs) {
      const body = read(`.claude/skills/${dir}/SKILL.md`);
      for (const m of body.matchAll(/\*\*([a-z-]+)\*\* agent/g)) {
        expect(agentNames, `/${dir} references unknown agent ${m[1]}`).toContain(m[1]);
      }
    }
  });
});

describe("settings and hooks", () => {
  const settings = JSON.parse(read(".claude/settings.json"));

  it("points every hook at an existing executable script", () => {
    const commands: string[] = Object.values(settings.hooks as Record<string, { hooks: { command: string }[] }[]>)
      .flat()
      .flatMap((g) => g.hooks.map((h) => h.command));
    expect(commands.length).toBeGreaterThanOrEqual(3);
    for (const cmd of commands) {
      const file = path.join(ROOT, cmd.replace("${CLAUDE_PROJECT_DIR}/", ""));
      expect(fs.existsSync(file), file).toBe(true);
      expect(fs.statSync(file).mode & 0o111, `${file} must be executable`).not.toBe(0);
    }
  });

  it("never lets Claude read the secrets file", () => {
    expect(settings.permissions.deny).toContain("Read(./.env)");
  });
});

describe("plan template", () => {
  it("has every section the commands rely on", () => {
    const t = read("docs/plans/_template.md");
    for (const heading of [
      "## Phases",
      "## Open questions",
      "## Conflicts with CLAUDE.md",
      "## Edge cases the plan must cover",
      "## Decisions log",
      "## Verification log",
    ]) {
      expect(t).toContain(heading);
    }
    expect(t).toMatch(/^status: /m);
  });
});
