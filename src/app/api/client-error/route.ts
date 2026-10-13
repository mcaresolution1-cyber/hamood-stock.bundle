/**
 * POST /api/client-error — the error screen reports what the user saw (reference + time + page), so a
 * "Report problem" message can be matched with Hostinger's runtime log. Server errors already have a
 * Next digest in the log; this records the client side and errors that never reached the server.
 *
 * Public on purpose (the login page can fail too), so it is kept cheap and harmless: same-origin only,
 * body size checked before reading, every value JSON-quoted with control characters removed (no fake log
 * fields or terminal escapes), a small per-address limit, one log line, nothing stored.
 */
import type { NextRequest } from "next/server";

const MAX_BODY = 4096;
const PER_MINUTE = 10;
const hits = new Map<string, { count: number; resetAt: number }>();

function allow(key: string, now = Date.now()): boolean {
  const h = hits.get(key);
  if (!h || h.resetAt <= now) {
    if (hits.size > 5000) hits.clear(); // keep memory bounded
    hits.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  h.count++;
  return h.count <= PER_MINUTE;
}

/** JSON-quoted, control characters removed, length-capped: one field can't pose as another. */
const field = (v: unknown, max: number) =>
  JSON.stringify(typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").slice(0, max) : "");

// rules-allow: route-auth — must work on the login page and for signed-out users; only writes one log line
export async function POST(request: NextRequest) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return new Response(null, { status: 413 });
  const who = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(who)) return new Response(null, { status: 429 });

  const text = await request.text();
  if (text.length > MAX_BODY) return new Response(null, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  console.error(
    `[client-error] ref=${field(body.ref, 64)} digest=${field(body.digest, 64)} at=${field(body.at, 40)} path=${field(body.path, 300)} message=${field(body.message, 500)}`,
  );
  return new Response(null, { status: 204 });
}
