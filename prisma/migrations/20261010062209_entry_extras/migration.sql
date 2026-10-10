-- AlterTable
ALTER TABLE "StockEntry" ADD COLUMN     "customerPhone" TEXT;

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Hand-written constraints (Prisma cannot express these) ───

-- A VOID entry always has reason VOID and vice versa.
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_void_type_reason" CHECK (("type" = 'VOID') = ("reason" = 'VOID'));

-- An entry can be voided at most once (backs up the row lock in the void service).
CREATE UNIQUE INDEX "StockEntry_one_void_per_entry" ON "StockEntry"("linkedEntryId") WHERE "type" = 'VOID';

-- A transfer OUT has at most one IN half.
CREATE UNIQUE INDEX "StockEntry_one_transfer_in_per_out" ON "StockEntry"("linkedEntryId") WHERE "type" = 'TRANSFER_IN';

-- Photos: images only, at most 4 MB (decision Q10).
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_size_limit" CHECK ("size" > 0 AND "size" <= 4194304);
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_image_type" CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp'));
