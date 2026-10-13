import "server-only";
import { db } from "@/lib/db";

export async function listSuppliers(filters: { q?: string; showInactive?: boolean }) {
  const q = filters.q?.trim();
  return db.supplier.findMany({
    where: {
      ...(filters.showInactive ? {} : { active: true }),
      ...(q
        ? { OR: [{ nameEn: { contains: q } }, { nameAr: { contains: q } }, { phone: { contains: q } }, { vatNumber: { contains: q } }, { contactPerson: { contains: q } }] }
        : {}),
    },
    orderBy: [{ active: "desc" }, { nameEn: "asc" }],
    take: 500,
    include: { _count: { select: { entries: true } } },
  });
}

export type SupplierRow = Awaited<ReturnType<typeof listSuppliers>>[number];

/** Active suppliers for pickers. */
export async function supplierOptions() {
  return db.supplier.findMany({ where: { active: true }, select: { id: true, nameEn: true, nameAr: true }, orderBy: { nameEn: "asc" } });
}
