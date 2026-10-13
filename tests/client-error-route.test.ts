import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/client-error/route";

let ip = 0;
const post = (body: string, headers: Record<string, string> = {}) =>
  POST(new NextRequest("http://x/api/client-error", { method: "POST", body, headers: { "x-forwarded-for": `10.0.0.${++ip}`, ...headers } }));

describe("POST /api/client-error", () => {
  it("logs one sanitised line and stores nothing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(JSON.stringify({ ref: "AB12", at: "2026-10-13T05:00:00Z", path: "/admin/users\nINJECTED\u001b[31m", message: 'x" ref="FAKE' }), { "sec-fetch-site": "same-origin" });
    expect(res.status).toBe(204);
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0][0]);
    expect(line).toContain('ref="AB12"');
    expect(line).not.toMatch(/[\n\u001b]/);
    // The fake field stays inside the quoted message (its quotes escaped), so it can't pose as a real field.
    expect(line.endsWith(String.raw`message="x\" ref=\"FAKE"`)).toBe(true);
    expect(line.match(/ ref="/g)).toHaveLength(1);
    spy.mockRestore();
  });

  it("refuses cross-site posts, huge bodies and junk", async () => {
    expect((await post("{}", { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post("x".repeat(5000))).status).toBe(413);
    expect((await post("not json")).status).toBe(400);
    expect((await post("{}", { "content-length": "999999" })).status).toBe(413);
  });

  it("limits how often one address can report", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await post("{}", { "x-forwarded-for": "10.9.9.9" })).status);
    expect(statuses.filter((s) => s === 204)).toHaveLength(10);
    expect(statuses.at(-1)).toBe(429);
    spy.mockRestore();
  });
});
