-- Photos and supplier returns saved before Phase C1 (decision PC1/PC3 follow-up).

-- A photo belongs to one entry. Older entries kept their photo only in StockEntry.photoUrl
-- ("/api/attachments/<id>"); give each one its EntryAttachment row (the oldest entry wins a shared photo).
INSERT IGNORE INTO `EntryAttachment` (`entryId`, `attachmentId`, `position`)
SELECT MIN(e.`id`), a.`id`, 0
FROM `StockEntry` e
JOIN `Attachment` a ON a.`id` = SUBSTRING(e.`photoUrl`, CHAR_LENGTH('/api/attachments/') + 1)
WHERE e.`photoUrl` LIKE '/api/attachments/%'
  AND NOT EXISTS (SELECT 1 FROM `EntryAttachment` x WHERE x.`attachmentId` = a.`id`)
GROUP BY a.`id`;

-- CreateIndex / DropIndex (the unique index first: the foreign key needs one on attachmentId)
CREATE UNIQUE INDEX `EntryAttachment_attachmentId_key` ON `EntryAttachment`(`attachmentId`);
DROP INDEX `EntryAttachment_attachmentId_idx` ON `EntryAttachment`;

-- Older returns to supplier get their follow-up row, so the credit can be recorded.
INSERT INTO `SupplierReturn` (`entryId`, `expectedCredit`, `status`, `updatedById`, `updatedAt`)
SELECT e.`id`, NULL, 'SENT', e.`createdById`, CURRENT_TIMESTAMP(3)
FROM `StockEntry` e
WHERE e.`reason` = 'SUPPLIER_RETURN'
  AND NOT EXISTS (SELECT 1 FROM `SupplierReturn` s WHERE s.`entryId` = e.`id`);
