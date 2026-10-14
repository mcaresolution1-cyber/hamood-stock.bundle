import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth/dal";

/**
 * Product photos for signed-in users (technicians too — their jobs show the products). `?size=thumb`
 * returns the small version. An image id never changes content, so the browser may keep it for a day.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/product-images/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.mustChangePassword || !(can(user.role, "stock:view") || can(user.role, "job:own"))) {
    return new Response("Forbidden", { status: 403 });
  }
  const { id } = await params;
  const thumb = new URL(req.url).searchParams.get("size") === "thumb";
  const image = thumb
    ? await db.productImage.findUnique({ where: { id }, select: { mimeType: true, thumb: true } }).then((i) => i && { mimeType: i.mimeType, body: i.thumb })
    : await db.productImage.findUnique({ where: { id }, select: { mimeType: true, data: true } }).then((i) => i && { mimeType: i.mimeType, body: i.data });
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(image.body as BodyInit, {
    headers: {
      // The thumbnail is always the JPEG made in the browser; the full image keeps its type.
      "Content-Type": thumb ? "image/jpeg" : image.mimeType,
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
