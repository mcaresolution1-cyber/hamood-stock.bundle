-- Plan channels-returns (follow-up): where a returned item was sold.

-- AlterTable
ALTER TABLE `StockEntry` ADD COLUMN `salesChannel` VARCHAR(16) NULL;

-- Returns saved earlier take the channel of the sale they were linked to (one-time fill of a new column).
UPDATE `StockEntry` r JOIN `StockEntry` s ON s.`id` = r.`originalEntryId`
SET r.`salesChannel` = CASE s.`reason`
    WHEN 'WEBSITE_ORDER' THEN 'WEBSITE'
    WHEN 'NOON_ORDER' THEN 'NOON'
    WHEN 'AMAZON_ORDER' THEN 'AMAZON'
    ELSE 'SHOWROOM' END
WHERE r.`reason` = 'CUSTOMER_RETURN';
