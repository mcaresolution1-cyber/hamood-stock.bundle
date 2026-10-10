/**
 * Idempotent seed: safe to run any number of times.
 * - Creates (never overwrites) the admin user, base warehouses and counters.
 * - Sample products only when SEED_SAMPLE_PRODUCTS=true (local dev); production starts with none.
 * - Admin email: SEED_ADMIN_EMAIL, default admin@hamoodtv.local.
 * - Does NOT create stock entries; stock only ever comes from saved entries.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { ENTRY_NUMBER_PREFIXES } from "../src/lib/stock/numbering";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL || "admin@hamoodtv.local").trim().toLowerCase();
const SAMPLE_PRODUCTS = process.env.SEED_SAMPLE_PRODUCTS === "true";

const warehouses: Prisma.WarehouseCreateInput[] = [
  { name: "Riyadh Main", city: "Riyadh", kind: "SELLABLE" },
  { name: "Damaged Stock", city: "Riyadh", kind: "DAMAGED" },
];

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
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword === "CHANGE_ME") {
    throw new Error("Set SEED_ADMIN_PASSWORD in .env before seeding");
  }
  if (adminPassword.length < 8) throw new Error("SEED_ADMIN_PASSWORD must be at least 8 characters");
  if (!/^[^\s@]+@[^\s@]+$/.test(ADMIN_EMAIL)) throw new Error(`SEED_ADMIN_EMAIL is not an email: ${ADMIN_EMAIL}`);

  const existingAdmin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existingAdmin) {
    console.log(`• admin ${ADMIN_EMAIL} already exists (password left unchanged)`);
  } else {
    await prisma.user.create({
      data: {
        name: "Admin",
        email: ADMIN_EMAIL,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        role: "ADMIN",
      },
    });
    console.log(`✓ created admin ${ADMIN_EMAIL}`);
  }

  for (const w of warehouses) {
    await prisma.warehouse.upsert({ where: { name: w.name }, create: w, update: {} });
  }
  console.log(`✓ warehouses: ${warehouses.map((w) => w.name).join(", ")}`);

  if (SAMPLE_PRODUCTS) {
    for (const p of products) {
      await prisma.product.upsert({ where: { modelCode: p.modelCode }, create: p, update: {} });
    }
    console.log(`✓ sample products: ${products.length}`);
  } else {
    console.log("• sample products skipped (set SEED_SAMPLE_PRODUCTS=true to add them)");
  }

  await prisma.counter.createMany({
    data: Object.values(ENTRY_NUMBER_PREFIXES).map((key) => ({ key, value: 0 })),
    skipDuplicates: true,
  });
  console.log("✓ counters");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
