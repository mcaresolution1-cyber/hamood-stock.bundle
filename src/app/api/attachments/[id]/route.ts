import { db } from "@/lib/db";
import { routeGuard } from "@/server/export/template";

/** Delivery-note photos — signed-in users only, never cached publicly. */
export async function GET(_req: Request, { params }: RouteContext<"/api/attachments/[id]">) {
  const denied = await routeGuard("stock:view");
  if (denied) return denied;
  const { id } = await params;
  const file = await db.attachment.findUnique({ where: { id }, select: { data: true, mimeType: true } });
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.data, {
    headers: {
      "Content-Type": file.mimeType,
      // no-store: on shared warehouse phones a photo must not outlive the session.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
