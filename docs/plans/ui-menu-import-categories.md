---
title: Sidebar menu, product import with column matching, managed categories
slug: ui-menu-import-categories
spec: user request in chat, 2026-10-14
status: approved # requested directly by the owner
branch: feature/v2-ui
pr: (opened with this branch)
---

# Sidebar menu, product import with column matching, managed categories

## Summary
Owner's request (2026-10-14):
1. "Add product" in the menu; a **sidebar** instead of the top navigation bar.
2. In Add product, an **import** option: upload CSV or Excel, the columns are matched to the product
   fields automatically, a **preview** is shown, then the user imports.
3. Products can have **several categories**, and categories can be added.

Roles: product management stays ADMIN-only (`product:manage`); the sidebar shows each role what it may open.

## Non-goals
- Category hierarchy (sub-categories), category images, WooCommerce category sync.
- Changing the product status from the import (Q8 still holds).

## Decisions
- **PU1 — Sidebar.** From `md` up a fixed sidebar on the start side (left in EN, right in AR) with
  sections: main, Products (All products, Add product, Import products, Categories), Admin. Phones keep
  the slide-out menu with the same sections. The top bar keeps the brand, language and user menu.
- **PU2 — Categories are data.** `Category` table (English + Arabic name, active, position) replaces the
  four fixed keys (reverses v1 Q9). The four existing categories are created by the migration and every
  product keeps its category. A product has **one or more** categories (`ProductCategory`); the first is
  its main one (lists show all, joined by " · "). Categories in use are deactivated, not deleted; an
  unused one may be deleted. Inactive categories can't be chosen for products (a product keeps one it has).
- **PU3 — Import columns.** After upload the app reads the header row and suggests a product field for each
  column (English and Arabic header names, common synonyms such as "Item code", "Price", "الاسم"). The user
  can change or skip any column, sees the first rows under the matched fields, then checks the file
  (row-by-row result) and imports. The server re-reads the file with the same mapping and re-validates —
  it never trusts the preview.
- **PU4 — Categories in the import.** A category cell may list several categories separated by `,` `;` `|`
  `/` or the Arabic comma `،`, matched by English or Arabic name. Names that don't exist are listed in the
  preview and **created** on import (as active categories with that name in both languages, to be renamed
  later if needed). On update, a non-empty category cell replaces the product's categories.

## Data model changes
| Change | Migration | Constraint / backfill |
|--------|-----------|-----------------------|
| `Category`, `ProductCategory` | `20261014150000_product_categories` | unique names (EN, AR); backfill the 4 categories + one link per product from `Product.category` |
| drop `Product.category` | same | after the backfill |

## Phases (one commit)
**Server actions / routes**
| Action / route | Permission |
|----------------|------------|
| `createCategory`, `updateCategory`, `setCategoryActive`, `deleteCategory` | `product:manage` |
| `readProductImportColumns` (headers + sample rows + suggested mapping) | `product:manage` |
| `previewProductImport`, `applyProductImport` (+ mapping) | `product:manage` |

**Tests:** column suggestion + mapping (unit), multi-category parsing (unit), categories CRUD + product
create/update with several categories + import creating categories (integration), nav sections (unit).

**Done when:** `pnpm verify` passes and the screens are checked in EN/AR on phone and desktop.
