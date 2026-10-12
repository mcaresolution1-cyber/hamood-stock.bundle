/**
 * Next.js calls register() once per server start, before it serves requests.
 * We use it to migrate the database and create the base data (src/server/db/bootstrap.ts).
 * If that fails the error is thrown: Next then answers every request with an error (it never serves
 * pages on a half-ready database) and logs the reason, e.g. "Access denied for user …"
 * (README → Troubleshooting). Fix the setting and redeploy/restart.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return; // the proxy (edge) doesn't touch the database
  const { bootstrap } = await import("./server/db/bootstrap");
  await bootstrap();
}
