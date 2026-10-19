-- Automatic SKUs (plan import-sku, PS1): HMD00 + the number with at least 3 digits, in creation order.

-- Two steps, so a new SKU never clashes with an old one while rows are being renumbered
UPDATE `Product` SET `sku` = CONCAT('~', `id`);

UPDATE `Product` p
JOIN (SELECT `id`, ROW_NUMBER() OVER (ORDER BY `createdAt`, `id`) AS n FROM `Product`) x ON x.`id` = p.`id`
SET p.`sku` = CONCAT('HMD00', IF(x.n < 100, LPAD(x.n, 3, '0'), x.n));

-- The counter continues after the last number given
INSERT INTO `Counter` (`key`, `value`) SELECT 'SKU', COUNT(*) FROM `Product`
ON DUPLICATE KEY UPDATE `value` = GREATEST(`value`, VALUES(`value`));
