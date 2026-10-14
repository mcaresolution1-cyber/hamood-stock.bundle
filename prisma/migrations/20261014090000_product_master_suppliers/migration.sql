-- v2 Phase B: product master (SKU, barcode, prices, attributes, status, images, cost history,
-- per-warehouse reorder levels) and the supplier master (docs/plans/v2.md, decisions PB1-PB4).
-- Rule: no semicolons inside comments (the runner splits statements on them).

-- CreateTable
CREATE TABLE `Supplier` (
    `id` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(200) NOT NULL,
    `nameAr` VARCHAR(200) NULL,
    `contactPerson` VARCHAR(100) NULL,
    `phone` VARCHAR(30) NULL,
    `email` VARCHAR(200) NULL,
    `city` VARCHAR(100) NULL,
    `country` VARCHAR(100) NULL,
    `vatNumber` VARCHAR(30) NULL,
    `paymentTerms` VARCHAR(100) NULL,
    `notes` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Supplier_nameEn_key`(`nameEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductImage` (
    `id` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(32) NOT NULL,
    `data` MEDIUMBLOB NOT NULL,
    `thumb` MEDIUMBLOB NOT NULL,
    `size` INTEGER NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductCost` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `cost` DECIMAL(12, 2) NULL,
    `source` VARCHAR(16) NOT NULL,
    `changedById` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProductCost_productId_at_idx`(`productId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductReorder` (
    `productId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `reorderLevel` INTEGER NOT NULL,
    `reorderQty` INTEGER NOT NULL DEFAULT 0,

    INDEX `ProductReorder_warehouseId_idx`(`warehouseId`),
    PRIMARY KEY (`productId`, `warehouseId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: new product fields. SKU starts as the model code for existing products.
ALTER TABLE `Product` ADD COLUMN `sku` VARCHAR(64) NULL,
    ADD COLUMN `barcode` VARCHAR(64) NULL,
    ADD COLUMN `sizeRange` VARCHAR(50) NULL,
    ADD COLUMN `colour` VARCHAR(50) NULL,
    ADD COLUMN `maxLoadKg` INTEGER NULL,
    ADD COLUMN `vesa` VARCHAR(50) NULL,
    ADD COLUMN `imageId` VARCHAR(191) NULL,
    ADD COLUMN `sellingPrice` DECIMAL(12, 2) NULL,
    ADD COLUMN `leadTimeDays` INTEGER NULL,
    ADD COLUMN `wooSku` VARCHAR(100) NULL,
    ADD COLUMN `status` ENUM('ACTIVE', 'DISCONTINUED', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN `defaultSupplierId` VARCHAR(191) NULL;

UPDATE `Product` SET `sku` = LEFT(`modelCode`, 64);

-- A deactivated product (v1) could still leave but not come in: that is Discontinued (PB1).
UPDATE `Product` SET `status` = 'DISCONTINUED' WHERE `active` = false;

ALTER TABLE `Product` MODIFY `sku` VARCHAR(64) NOT NULL;

-- DropIndex
DROP INDEX `Product_active_idx` ON `Product`;

-- AlterTable
ALTER TABLE `Product` DROP COLUMN `active`;

-- CreateIndex
CREATE UNIQUE INDEX `Product_sku_key` ON `Product`(`sku`);

-- CreateIndex
CREATE UNIQUE INDEX `Product_barcode_key` ON `Product`(`barcode`);

-- CreateIndex
CREATE INDEX `Product_status_idx` ON `Product`(`status`);

-- AlterTable
ALTER TABLE `StockEntry` ADD COLUMN `supplierId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `StockEntry_supplierId_reference_idx` ON `StockEntry`(`supplierId`, `reference`);

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_imageId_fkey` FOREIGN KEY (`imageId`) REFERENCES `ProductImage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_defaultSupplierId_fkey` FOREIGN KEY (`defaultSupplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductImage` ADD CONSTRAINT `ProductImage_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductCost` ADD CONSTRAINT `ProductCost_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductCost` ADD CONSTRAINT `ProductCost_changedById_fkey` FOREIGN KEY (`changedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductReorder` ADD CONSTRAINT `ProductReorder_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductReorder` ADD CONSTRAINT `ProductReorder_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockEntry` ADD CONSTRAINT `StockEntry_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written below.

-- Reorder numbers are never negative, a product image has a sane size and type.
ALTER TABLE `ProductReorder` ADD CONSTRAINT `ProductReorder_non_negative` CHECK (`reorderLevel` >= 0 AND `reorderQty` >= 0);
ALTER TABLE `ProductImage` ADD CONSTRAINT `ProductImage_size_limit` CHECK (`size` > 0 AND `size` <= 2097152);
ALTER TABLE `ProductImage` ADD CONSTRAINT `ProductImage_type` CHECK (`mimeType` IN ('image/jpeg', 'image/png', 'image/webp'));
ALTER TABLE `Product` ADD CONSTRAINT `Product_prices_non_negative` CHECK ((`sellingPrice` IS NULL OR `sellingPrice` >= 0) AND (`maxLoadKg` IS NULL OR `maxLoadKg` >= 0) AND (`leadTimeDays` IS NULL OR `leadTimeDays` >= 0));
