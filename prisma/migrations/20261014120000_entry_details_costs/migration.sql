-- v2 Phase C1: entry details (return reasons, damage categories, payment method, salesperson, original sale),
-- delivery line costs, several photos per entry, return-to-supplier follow-up (docs/plans/v2.md, PC1-PC3).
-- Rule: no semicolons inside comments (the runner splits statements on them).

-- AlterTable
ALTER TABLE `StockEntry` ADD COLUMN `reasonCode` VARCHAR(32) NULL,
    ADD COLUMN `paymentMethod` VARCHAR(16) NULL,
    ADD COLUMN `salesperson` VARCHAR(100) NULL,
    ADD COLUMN `originalEntryId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `StockEntry_originalEntryId_idx` ON `StockEntry`(`originalEntryId`);

-- CreateIndex
CREATE INDEX `StockEntry_reason_reference_idx` ON `StockEntry`(`reason`, `reference`);

-- CreateTable
CREATE TABLE `LineCost` (
    `lineId` VARCHAR(191) NOT NULL,
    `unitCost` DECIMAL(12, 2) NOT NULL,
    `enteredById` VARCHAR(191) NOT NULL,
    `enteredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`lineId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EntryAttachment` (
    `entryId` VARCHAR(191) NOT NULL,
    `attachmentId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,

    INDEX `EntryAttachment_attachmentId_idx`(`attachmentId`),
    PRIMARY KEY (`entryId`, `attachmentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupplierReturn` (
    `entryId` VARCHAR(191) NOT NULL,
    `expectedCredit` DECIMAL(12, 2) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'SENT',
    `creditAmount` DECIMAL(12, 2) NULL,
    `creditReceivedAt` DATETIME(3) NULL,
    `updatedById` VARCHAR(191) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SupplierReturn_status_idx`(`status`),
    PRIMARY KEY (`entryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StockEntry` ADD CONSTRAINT `StockEntry_originalEntryId_fkey` FOREIGN KEY (`originalEntryId`) REFERENCES `StockEntry`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `LineCost` ADD CONSTRAINT `LineCost_lineId_fkey` FOREIGN KEY (`lineId`) REFERENCES `StockEntryLine`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LineCost` ADD CONSTRAINT `LineCost_enteredById_fkey` FOREIGN KEY (`enteredById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EntryAttachment` ADD CONSTRAINT `EntryAttachment_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `StockEntry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EntryAttachment` ADD CONSTRAINT `EntryAttachment_attachmentId_fkey` FOREIGN KEY (`attachmentId`) REFERENCES `Attachment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierReturn` ADD CONSTRAINT `SupplierReturn_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `StockEntry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierReturn` ADD CONSTRAINT `SupplierReturn_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written below.

ALTER TABLE `LineCost` ADD CONSTRAINT `LineCost_non_negative` CHECK (`unitCost` >= 0);
ALTER TABLE `SupplierReturn` ADD CONSTRAINT `SupplierReturn_status_known` CHECK (`status` IN ('SENT', 'CREDIT_RECEIVED'));
ALTER TABLE `SupplierReturn` ADD CONSTRAINT `SupplierReturn_amounts_non_negative` CHECK ((`expectedCredit` IS NULL OR `expectedCredit` >= 0) AND (`creditAmount` IS NULL OR `creditAmount` >= 0));
ALTER TABLE `StockEntry` ADD CONSTRAINT `StockEntry_payment_method_known` CHECK (`paymentMethod` IS NULL OR `paymentMethod` IN ('CASH', 'CARD', 'TRANSFER'));
