-- Baseline for MariaDB 10.6+ (Hostinger) / MySQL 8. Replaces the earlier PostgreSQL migrations,
-- which never ran in production (decision H1 in docs/plans/hostinger.md). Written in Prisma's own
-- MySQL migration format. Prisma doesn't know the two generated guard columns at the end, so a migration
-- Prisma generates later may try to DROP them - remove those lines (check-rules blocks them).
-- Rule: no semicolons inside comments (the runner splits statements on them).

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(200) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'STAFF', 'VIEWER') NOT NULL DEFAULT 'VIEWER',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Warehouse` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `kind` ENUM('SELLABLE', 'DAMAGED') NOT NULL DEFAULT 'SELLABLE',
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Warehouse_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` VARCHAR(191) NOT NULL,
    `modelCode` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(200) NOT NULL,
    `nameAr` VARCHAR(200) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `variant` VARCHAR(200) NULL,
    `imageUrl` TEXT NULL,
    `cost` DECIMAL(12, 2) NULL,
    `lowStockLevel` INTEGER NOT NULL DEFAULT 0,
    `wooProductId` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Product_modelCode_key`(`modelCode`),
    INDEX `Product_category_idx`(`category`),
    INDEX `Product_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockEntry` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `type` ENUM('IN', 'OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'CORRECTION_IN', 'CORRECTION_OUT', 'VOID') NOT NULL,
    `reason` ENUM('SUPPLIER_DELIVERY', 'CUSTOMER_RETURN', 'OPENING_STOCK', 'WEBSITE_ORDER', 'DIRECT_SALE', 'INSTALLATION', 'TRANSFER', 'SUPPLIER_RETURN', 'DAMAGED_LOST', 'CORRECTION', 'VOID') NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `entryDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reference` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NULL,
    `customerPhone` VARCHAR(191) NULL,
    `technicianName` VARCHAR(191) NULL,
    `supplierName` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `photoUrl` VARCHAR(191) NULL,
    `linkedEntryId` VARCHAR(191) NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidedById` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StockEntry_number_key`(`number`),
    INDEX `StockEntry_entryDate_idx`(`entryDate`),
    INDEX `StockEntry_warehouseId_entryDate_idx`(`warehouseId`, `entryDate`),
    INDEX `StockEntry_type_entryDate_idx`(`type`, `entryDate`),
    INDEX `StockEntry_createdById_idx`(`createdById`),
    INDEX `StockEntry_linkedEntryId_idx`(`linkedEntryId`),
    INDEX `StockEntry_reference_idx`(`reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockEntryLine` (
    `id` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,

    INDEX `StockEntryLine_entryId_idx`(`entryId`),
    INDEX `StockEntryLine_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockLevel` (
    `productId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,

    INDEX `StockLevel_warehouseId_idx`(`warehouseId`),
    PRIMARY KEY (`productId`, `warehouseId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Counter` (
    `key` VARCHAR(191) NOT NULL,
    `value` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attachment` (
    `id` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `data` MEDIUMBLOB NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_UserWarehouses` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_UserWarehouses_AB_unique`(`A`, `B`),
    INDEX `_UserWarehouses_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StockEntry` ADD CONSTRAINT `StockEntry_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockEntry` ADD CONSTRAINT `StockEntry_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockEntry` ADD CONSTRAINT `StockEntry_voidedById_fkey` FOREIGN KEY (`voidedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockEntry` ADD CONSTRAINT `StockEntry_linkedEntryId_fkey` FOREIGN KEY (`linkedEntryId`) REFERENCES `StockEntry`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StockEntryLine` ADD CONSTRAINT `StockEntryLine_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `StockEntry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockEntryLine` ADD CONSTRAINT `StockEntryLine_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockLevel` ADD CONSTRAINT `StockLevel_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockLevel` ADD CONSTRAINT `StockLevel_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_UserWarehouses` ADD CONSTRAINT `_UserWarehouses_A_fkey` FOREIGN KEY (`A`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_UserWarehouses` ADD CONSTRAINT `_UserWarehouses_B_fkey` FOREIGN KEY (`B`) REFERENCES `Warehouse`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Hand-written safety constraints (Prisma cannot express these) ───

-- Line quantities are always positive (direction comes from the entry type).
ALTER TABLE `StockEntryLine` ADD CONSTRAINT `StockEntryLine_quantity_positive` CHECK (`quantity` > 0);

-- Stock can never go negative. The save transaction checks this first with a conditional
-- update, and this constraint is the last line of defence.
ALTER TABLE `StockLevel` ADD CONSTRAINT `StockLevel_quantity_non_negative` CHECK (`quantity` >= 0);

-- Counters only move forward from zero.
ALTER TABLE `Counter` ADD CONSTRAINT `Counter_value_non_negative` CHECK (`value` >= 0);

-- A VOID entry always has reason VOID and vice versa.
ALTER TABLE `StockEntry` ADD CONSTRAINT `StockEntry_void_type_reason` CHECK ((`type` = 'VOID') = (`reason` = 'VOID'));

-- MariaDB/MySQL have no partial unique indexes, so two generated columns hold linkedEntryId only for
-- the rows a rule is about (NULL otherwise, and NULLs never clash in a unique index).
-- Prisma doesn't know these columns and never reads or writes them.
-- An entry can be voided at most once (backs up the row lock in the void service).
ALTER TABLE `StockEntry` ADD COLUMN `voidOfId` VARCHAR(191) AS (CASE WHEN `type` = 'VOID' THEN `linkedEntryId` END) STORED;
CREATE UNIQUE INDEX `StockEntry_one_void_per_entry` ON `StockEntry`(`voidOfId`);

-- A transfer OUT has at most one IN half.
ALTER TABLE `StockEntry` ADD COLUMN `transferInOfId` VARCHAR(191) AS (CASE WHEN `type` = 'TRANSFER_IN' THEN `linkedEntryId` END) STORED;
CREATE UNIQUE INDEX `StockEntry_one_transfer_in_per_out` ON `StockEntry`(`transferInOfId`);

-- Photos: images only, at most 4 MB (decision Q10).
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_size_limit` CHECK (`size` > 0 AND `size` <= 4194304);
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_image_type` CHECK (`mimeType` IN ('image/jpeg', 'image/png', 'image/webp'));
