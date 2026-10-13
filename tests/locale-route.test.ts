import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/locale/route";

const call = (qs: string, headers: Record<string, string> = {}) =>
  GET(new NextRequest(`http://internal:3000/locale?${qs}`, { headers }));

describe("GET /locale", () => {
  it("sets the language cookie and sends the user back with a relative redirect", () => {
    const res = call(`l=ar&next=${encodeURIComponent("/admin/users?q=x")}`, { "x-forwarded-proto": "https" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/users?q=x"); // relative: safe behind Hostinger's proxy
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^NEXT_LOCALE=ar; Path=\//);
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("ignores unknown languages and refuses to redirect off the site", () => {
    const res = call(`l=fr&next=${encodeURIComponent("https://evil.com")}`);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
