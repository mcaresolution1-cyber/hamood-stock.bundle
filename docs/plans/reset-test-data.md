---
title: Clear the test data and create one test login per role
slug: reset-test-data
spec: owner's request in chat, 2026-10-23
status: approved # requested directly by the owner
branch: feature/reset-test-data
pr:
---

# Clear the test data and create one test login per role

Owner (2026-10-23): "I have added test data to test the app, I need you to get the app free and create me
logins for each user role". Answers: clear the test data on the **live Hostinger app**; clear **everything
except users**; logins for **all six roles**.

## Decisions
- Hostinger has no shell and Claude can't sign in to the live site, so the reset runs at server start-up
  when the owner sets `RESET_TEST_DATA` (a word of 8+ characters) and `RESET_LOGIN_PASSWORD` in hPanel.
- Runs once per `RESET_TEST_DATA` value (remembered in `Setting`), so a value left in the settings never clears
  real data on a later restart. One transaction; nothing is half-cleared.
- Cleared: entries, lines, stock levels, approvals, costs, supplier returns, photos, products, product
  images, categories, suppliers, warehouses. Kept: users (their warehouse assignments go with the
  warehouses), audit log (plus a "Test data cleared" row), sign-in history, settings.
- Afterwards: entry, request and SKU numbers start from 1; the four default categories and the two default
  warehouses (Riyadh Main, Damaged Stock) are recreated.
- Logins `test.<role>@hamoodtv.local` for Admin, Manager (both warehouses), Staff (Riyadh Main), Technician,
  Accountant, Viewer — temporary password from `RESET_LOGIN_PASSWORD`, changed at first sign-in. Running the
  reset again resets these logins.
