-- Plan channels-returns: Noon and Amazon orders as sales, and the condition of a returned item.

-- AlterTable
ALTER TABLE `StockEntry` MODIFY `reason` ENUM('SUPPLIER_DELIVERY', 'CUSTOMER_RETURN', 'OPENING_STOCK', 'WEBSITE_ORDER', 'NOON_ORDER', 'AMAZON_ORDER', 'DIRECT_SALE', 'INSTALLATION', 'TRANSFER', 'SUPPLIER_RETURN', 'DAMAGED_LOST', 'CORRECTION', 'VOID') NOT NULL,
    ADD COLUMN `itemCondition` VARCHAR(16) NULL;

-- Returns saved before this change went by warehouse kind. A one-time fill of the new derived column
-- (decision in docs/plans/channels-returns.md), not an edit of what was recorded.
UPDATE `StockEntry` e JOIN `Warehouse` w ON w.`id` = e.`warehouseId`
SET e.`itemCondition` = IF(w.`kind` = 'DAMAGED', 'BROKEN', 'RESELLABLE')
WHERE e.`reason` = 'CUSTOMER_RETURN' AND e.`type` = 'IN';
