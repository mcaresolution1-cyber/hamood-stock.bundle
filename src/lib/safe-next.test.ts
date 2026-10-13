import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("keeps paths on this site, with their query", () => {
    expect(safeNextPath("/admin/users")).toBe("/admin/users");
    expect(safeNextPath("/reports/movements?from=2026-10-01&page=2")).toBe("/reports/movements?from=2026-10-01&page=2");
  });

  it("rejects anything that could leave the site", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil.com", "javascript:alert(1)", "/ok\nSet-Cookie:x", "/a\\b", "", null, undefined]) {
      expect(safeNextPath(bad as string)).toBe("/");
    }
    expect(safeNextPath("/" + "a".repeat(3000))).toBe("/");
  });

  it("percent-encodes non-ASCII paths so the redirect header stays valid", () => {
    expect(safeNextPath("/ا")).toBe("/%D8%A7");
    expect(() => new Headers({ Location: safeNextPath("/products?q=حامل") })).not.toThrow();
  });
});
