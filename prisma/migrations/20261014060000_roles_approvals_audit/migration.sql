-- v2 Phase A: new roles, sign-in security, approvals, audit log, settings (docs/plans/v2.md).
-- Rule: no semicolons inside comments (the runner splits statements on them).

-- AlterTable
ALTER TABLE `User` MODIFY `role` ENUM('ADMIN', 'MANAGER', 'STAFF', 'TECHNICIAN', 'ACCOUNTANT', 'VIEWER') NOT NULL DEFAULT 'VIEWER',
    ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `passwordChangedAt` DATETIME(3) NULL,
    ADD COLUMN `lastLoginAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `LoginEvent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `email` VARCHAR(200) NOT NULL,
    `ip` VARCHAR(64) NULL,
    `success` BOOLEAN NOT NULL,
    `reason` VARCHAR(32) NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LoginEvent_email_at_idx`(`email`, `at`),
    INDEX `LoginEvent_ip_at_idx`(`ip`, `at`),
    INDEX `LoginEvent_userId_at_idx`(`userId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actorId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `subjectType` VARCHAR(32) NOT NULL,
    `subjectId` VARCHAR(191) NULL,
    `subjectLabel` VARCHAR(200) NULL,
    `before` JSON NULL,
    `after` JSON NULL,

    INDEX `AuditLog_at_idx`(`at`),
    INDEX `AuditLog_subjectType_at_idx`(`subjectType`, `at`),
    INDEX `AuditLog_actorId_at_idx`(`actorId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApprovalRequest` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NOT NULL,
    `kind` ENUM('ENTRY', 'VOID') NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `rule` VARCHAR(32) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `otherWarehouseId` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `units` INTEGER NOT NULL,
    `value` DECIMAL(12, 2) NULL,
    `targetEntryId` VARCHAR(191) NULL,
    `resultEntryId` VARCHAR(191) NULL,
    `idempotencyKey` VARCHAR(64) NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decidedById` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` TEXT NULL,

    UNIQUE INDEX `ApprovalRequest_number_key`(`number`),
    UNIQUE INDEX `ApprovalRequest_resultEntryId_key`(`resultEntryId`),
    UNIQUE INDEX `ApprovalRequest_idempotencyKey_key`(`idempotencyKey`),
    INDEX `ApprovalRequest_status_requestedAt_idx`(`status`, `requestedAt`),
    INDEX `ApprovalRequest_requestedById_requestedAt_idx`(`requestedById`, `requestedAt`),
    INDEX `ApprovalRequest_warehouseId_status_idx`(`warehouseId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `key` VARCHAR(64) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedById` VARCHAR(191) NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LoginEvent` ADD CONSTRAINT `LoginEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_otherWarehouseId_fkey` FOREIGN KEY (`otherWarehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_targetEntryId_fkey` FOREIGN KEY (`targetEntryId`) REFERENCES `StockEntry`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_resultEntryId_fkey` FOREIGN KEY (`resultEntryId`) REFERENCES `StockEntry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written below (Prisma doesn't know these - remove any DROP of them from generated migrations).

-- Units are always positive, a request has a known rule.
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_units_positive` CHECK (`units` > 0);
ALTER TABLE `ApprovalRequest` ADD CONSTRAINT `ApprovalRequest_rule_known` CHECK (`rule` IN ('correction', 'damaged', 'void'));

-- At most one PENDING void request per entry (MariaDB has no partial indexes, see decision H5).
ALTER TABLE `ApprovalRequest` ADD COLUMN `pendingVoidOf` VARCHAR(191) AS (CASE WHEN `kind` = 'VOID' AND `status` = 'PENDING' THEN `targetEntryId` END) STORED;
CREATE UNIQUE INDEX `ApprovalRequest_pendingVoidOf_key` ON `ApprovalRequest`(`pendingVoidOf`);

-- Request numbers come from the same Counter table as entry numbers.
INSERT IGNORE INTO `Counter` (`key`, `value`) VALUES ('REQ', 0);
