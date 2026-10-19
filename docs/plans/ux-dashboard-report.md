---
title: UX polish, dashboard stock movement chart, branded inventory report
slug: ux-dashboard-report
spec: owner's prompt of 2026-10-19 ("Hamood Stock: UX polish + dashboard reports + branded report export")
status: approved # requested directly by the owner
branch: feature/ux-dashboard-report
pr:
---

# UX polish, dashboard stock movement chart, branded inventory report

No business-logic or schema change. Decisions where the prompt left a choice:

- **PX1 — Approved / voided.** Pending requests are not entries (they live in `ApprovalRequest`), so every
  `StockEntry` is approved. Voided entries and their VOID reversals are left out of the chart and the report
  (a voided entry "didn't happen"); opening/closing balances are computed the same way, so
  opening + in − out = closing always holds.
- **PX2 — Transfers.** A transfer is a TRANSFER_OUT + TRANSFER_IN pair. Left out of "All warehouses" totals,
  counted as out / in when one warehouse is selected. Corrections count as in / out; opening stock is left out
  of the chart unless "Include opening stock" is ticked, and counted as "in" in the report (it is stock that
  arrived in the range).
- **PX3 — Days** are Riyadh days (UTC+3 all year, `INTERVAL 3 HOUR` as elsewhere); empty days are zero.
- **PX4 — Report route** `/print/report` (outside the app layout, like the delivery note) — no sidebar to hide;
  Download PDF = `window.print()` with A4 print CSS; page numbers and the footer use `@page` margin boxes;
  the branded header repeats through `thead`. Download Excel = one workbook, four sheets.
- **PX5 — Brand.** `--brand` CSS variable (used by `--primary` and the active nav item). The logo is a
  placeholder at `public/brand/logo.svg` until the real file is supplied.
- **PX6 — Speed.** Pages make 7–18 queries each and answer in 50–230 ms locally (no N+1 found); the wait
  is the full server round trip on every navigation. `staleTimes.dynamic = 30` keeps a visited page for 30 s
  on the client (server actions still revalidate after saving).
- **PX7 — Products table columns** show active warehouses that hold stock (test warehouses with nothing in
  them disappear; deactivating them on the Warehouses page hides them for good).
