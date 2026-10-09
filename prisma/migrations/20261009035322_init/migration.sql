-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF', 'VIEWER');

-- CreateEnum
CREATE TYPE "WarehouseKind" AS ENUM ('SELLABLE', 'DAMAGED');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('IN', 'OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'CORRECTION_IN', 'CORRECTION_OUT', 'VOID');

-- CreateEnum
CREATE TYPE "EntryReason" AS ENUM ('SUPPLIER_DELIVERY', 'CUSTOMER_RETURN', 'OPENING_STOCK', 'WEBSITE_ORDER', 'DIRECT_SALE', 'INSTALLATION', 'TRANSFER', 'SUPPLIER_RETURN', 'DAMAGED_LOST', 'CORRECTION', 'VOID');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "kind" "WarehouseKind" NOT NULL DEFAULT 'SELLABLE',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "modelCode" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "variant" TEXT,
    "imageUrl" TEXT,
    "cost" DECIMAL(12,2),
    "lowStockLevel" INTEGER NOT NULL DEFAULT 0,
    "wooProductId" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockEntry" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "EntryType" NOT NULL,
    "reason" "EntryReason" NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "entryDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "customerName" TEXT,
    "technicianName" TEXT,
    "supplierName" TEXT,
    "note" TEXT,
    "photoUrl" TEXT,
    "linkedEntryId" TEXT,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockEntryLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "StockEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("productId","warehouseId")
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "_UserWarehouses" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserWarehouses_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_name_key" ON "Warehouse"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_modelCode_key" ON "Product"("modelCode");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_active_idx" ON "Product"("active");

-- CreateIndex
CREATE UNIQUE INDEX "StockEntry_number_key" ON "StockEntry"("number");

-- CreateIndex
CREATE INDEX "StockEntry_entryDate_idx" ON "StockEntry"("entryDate");

-- CreateIndex
CREATE INDEX "StockEntry_warehouseId_entryDate_idx" ON "StockEntry"("warehouseId", "entryDate");

-- CreateIndex
CREATE INDEX "StockEntry_type_entryDate_idx" ON "StockEntry"("type", "entryDate");

-- CreateIndex
CREATE INDEX "StockEntry_createdById_idx" ON "StockEntry"("createdById");

-- CreateIndex
CREATE INDEX "StockEntry_linkedEntryId_idx" ON "StockEntry"("linkedEntryId");

-- CreateIndex
CREATE INDEX "StockEntry_reference_idx" ON "StockEntry"("reference");

-- CreateIndex
CREATE INDEX "StockEntryLine_entryId_idx" ON "StockEntryLine"("entryId");

-- CreateIndex
CREATE INDEX "StockEntryLine_productId_idx" ON "StockEntryLine"("productId");

-- CreateIndex
CREATE INDEX "StockLevel_warehouseId_idx" ON "StockLevel"("warehouseId");

-- CreateIndex
CREATE INDEX "_UserWarehouses_B_index" ON "_UserWarehouses"("B");

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_linkedEntryId_fkey" FOREIGN KEY ("linkedEntryId") REFERENCES "StockEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntryLine" ADD CONSTRAINT "StockEntryLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "StockEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntryLine" ADD CONSTRAINT "StockEntryLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserWarehouses" ADD CONSTRAINT "_UserWarehouses_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserWarehouses" ADD CONSTRAINT "_UserWarehouses_B_fkey" FOREIGN KEY ("B") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Hand-written safety constraints (Prisma cannot express CHECK constraints) ───

-- Line quantities are always positive (direction comes from the entry type).
ALTER TABLE "StockEntryLine" ADD CONSTRAINT "StockEntryLine_quantity_positive" CHECK ("quantity" > 0);

-- Stock can never go negative. The save transaction checks this first with a conditional
-- update, and this constraint is the last line of defence.
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_quantity_non_negative" CHECK ("quantity" >= 0);

-- Counters only move forward from zero.
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_value_non_negative" CHECK ("value" >= 0);
