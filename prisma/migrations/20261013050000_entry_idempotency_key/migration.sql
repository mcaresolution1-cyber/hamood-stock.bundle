-- AlterTable
ALTER TABLE `StockEntry` ADD COLUMN `idempotencyKey` VARCHAR(64) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `StockEntry_idempotencyKey_key` ON `StockEntry`(`idempotencyKey`);
