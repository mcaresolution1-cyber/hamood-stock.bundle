-- Managed product categories, several per product (plan ui-menu-import-categories, decision PU2).

-- CreateTable
CREATE TABLE `Category` (
    `id` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(100) NOT NULL,
    `nameAr` VARCHAR(100) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Category_nameEn_key`(`nameEn`),
    UNIQUE INDEX `Category_nameAr_key`(`nameAr`),
    INDEX `Category_active_position_idx`(`active`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductCategory` (
    `productId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `ProductCategory_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`productId`, `categoryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProductCategory` ADD CONSTRAINT `ProductCategory_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductCategory` ADD CONSTRAINT `ProductCategory_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: the four fixed categories (same names as the app showed), then one link per product
INSERT INTO `Category` (`id`, `nameEn`, `nameAr`, `active`, `position`) VALUES
    ('cat-wall-mount', 'TV wall mounts', 'حوامل تلفزيون جدارية', true, 1),
    ('cat-floor-stand', 'Floor stands', 'ستاندات أرضية', true, 2),
    ('cat-monitor-mount', 'Monitor mounts', 'حوامل شاشات', true, 3),
    ('cat-tv-table', 'TV tables', 'طاولات تلفزيون', true, 4);

INSERT INTO `ProductCategory` (`productId`, `categoryId`, `position`)
SELECT `id`, CONCAT('cat-', `category`), 0 FROM `Product`
WHERE `category` IN ('wall-mount', 'floor-stand', 'monitor-mount', 'tv-table');

-- A product with any other value (only possible through direct SQL) still gets a category
INSERT INTO `ProductCategory` (`productId`, `categoryId`, `position`)
SELECT p.`id`, 'cat-wall-mount', 0 FROM `Product` p
WHERE NOT EXISTS (SELECT 1 FROM `ProductCategory` pc WHERE pc.`productId` = p.`id`);

-- DropIndex / DropColumn
DROP INDEX `Product_category_idx` ON `Product`;
ALTER TABLE `Product` DROP COLUMN `category`;
