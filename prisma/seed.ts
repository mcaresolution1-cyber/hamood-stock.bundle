/**
 * Idempotent seed: safe to run any number of times.
 * - Base data via ensureBaseData (counters, default warehouses if none, first admin if no users) —
 *   the server does the same at start-up, so production needs no seed run.
 * - Sample products only when SEED_SAMPLE_PRODUCTS=true (local dev); production starts with none.
 * - Admin email: SEED_ADMIN_EMAIL, default admin@hamoodtv.local. Run migrations first (pnpm db:deploy).
 * - Does NOT create stock entries; stock only ever comes from saved entries.
 */
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { ensureBaseData, firstAdminFromEnv } from "../src/server/db/base-data";
import { mariadbConfig } from "../src/lib/db-config";

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(mariadbConfig(process.env.DATABASE_URL)) });

const SAMPLE_PRODUCTS = process.env.SEED_SAMPLE_PRODUCTS === "true";

const products: Prisma.ProductCreateInput[] = [
  {
    modelCode: "HMD-772",
    nameEn: "Full-motion TV wall mount 37–75″",
    nameAr: "حامل تلفزيون جداري متحرك 37–75 بوصة",
    category: "wall-mount",
    variant: "Black",
    lowStockLevel: 10,
  },
  {
    modelCode: "HMD-300",
    nameEn: "Fixed slim TV wall mount 32–65″",
    nameAr: "حامل تلفزيون جداري ثابت نحيف 32–65 بوصة",
    category: "wall-mount",
    variant: "Black",
    lowStockLevel: 15,
  },
  {
    modelCode: "HMD-744",
    nameEn: "Tilting TV wall mount 43–90″",
    nameAr: "حامل تلفزيون جداري مائل 43–90 بوصة",
    category: "wall-mount",
    variant: "Black",
    lowStockLevel: 10,
  },
  {
    modelCode: "HAM-875",
    nameEn: "Motorized TV floor stand 55–100″",
    nameAr: "ستاند تلفزيون أرضي كهربائي 55–100 بوصة",
    category: "floor-stand",
    variant: "Black",
    lowStockLevel: 3,
  },
  {
    modelCode: "HAM-458",
    nameEn: "Rolling TV floor stand 32–75″",
    nameAr: "ستاند تلفزيون أرضي بعجلات 32–75 بوصة",
    category: "floor-stand",
    variant: "Black",
    lowStockLevel: 5,
  },
  {
    modelCode: "AC14601B",
    nameEn: "Single monitor desk mount 17–32″",
    nameAr: "حامل شاشة مكتبي مفرد 17–32 بوصة",
    category: "monitor-mount",
    variant: "Black",
    lowStockLevel: 8,
  },
  {
    modelCode: "HMD-1537",
    nameEn: "TV table with storage 160 cm",
    nameAr: "طاولة تلفزيون مع تخزين 160 سم",
    category: "tv-table",
    variant: "Walnut",
    lowStockLevel: 2,
  },
  {
    modelCode: "HMD-1530",
    nameEn: "TV table 120 cm",
    nameAr: "طاولة تلفزيون 120 سم",
    category: "tv-table",
    variant: "White",
    lowStockLevel: 2,
  },
];

async function main() {
  const admin = firstAdminFromEnv();
  if (!admin.password || admin.password === "CHANGE_ME") throw new Error("Set SEED_ADMIN_PASSWORD in .env before seeding");
  if (admin.password.length < 8) throw new Error("SEED_ADMIN_PASSWORD must be at least 8 characters");

  // Same base data the server creates at start-up (counters, default warehouses, first admin).
  const { adminCreated } = await ensureBaseData(prisma, admin, (m) => console.log(`✓ ${m}`));
  if (!adminCreated) console.log("• users already exist — no admin created (passwords are never changed)");

  if (SAMPLE_PRODUCTS) {
    for (const p of products) {
      await prisma.product.upsert({ where: { modelCode: p.modelCode }, create: p, update: {} });
    }
    console.log(`✓ sample products: ${products.length}`);
  } else {
    console.log("• sample products skipped (set SEED_SAMPLE_PRODUCTS=true to add them)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
