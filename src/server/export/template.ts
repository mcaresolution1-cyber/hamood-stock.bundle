/** Build small .xlsx templates for imports. Server only. */
import "server-only";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/server/auth/dal";
import { can, type Action } from "@/lib/permissions";

export async function xlsxResponse(filename: string, headers: string[], examples: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(headers).font = { bold: true };
  for (const row of examples) ws.addRow(row);
  ws.columns.forEach((c) => (c.width = 22));
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** For route handlers: 401 when signed out, 403 when the role may not do `action`, else null. */
export async function routeGuard(action: Action): Promise<Response | null> {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user.role, action)) return new Response("Forbidden", { status: 403 });
  return null;
}
