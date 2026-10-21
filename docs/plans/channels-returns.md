---
title: Noon and Amazon channels, return reasons, returned item condition
slug: channels-returns
spec: owner's request in chat, 2026-10-20
status: approved # requested directly by the owner
branch: feature/channels-returns
pr:
---

# Noon and Amazon channels, return reasons, returned item condition

Owner (2026-10-20): "in/out inventory details include Noon and Amazon as well, also for returns there should be a
reason, also the product condition: resellable, broken, trashed".

## Decisions
- **PR1 — Channels.** Two new stock-out reasons, **Noon order** and **Amazon order** (sales, like Website order):
  order number required (trimmed, spaces removed, upper case), a repeat order number is a warning, only from
  sellable warehouses. Customer returns find the original sale by the order number for these too, so a return
  of a Noon or Amazon order is linked to it and limited to what was sold. Reports, filters and the chart pick
  them up as ordinary reasons.
- **PR2 — Return reasons.** Customer returns already need a reason. Returns to supplier now need one too
  (defective, wrong item, damaged in delivery, excess stock, other); their note becomes optional except for
  "other", as it is for customer returns.
- **PR3 — Condition of a returned item** (stored on the entry):
  - **Resellable** → into a sellable warehouse (as before).
  - **Broken** → into a damaged-stock warehouse (was "damaged"; same rule, Q2: any damaged warehouse).
  - **Trashed** → the return is recorded into a damaged-stock warehouse and, in the same transaction, written
    off with a linked damaged/lost entry ("returned trashed"), so stock does not change but both movements are
    on record. The write-off is part of the return: no separate approval (and, like a damaged return, no
    assignment to the damaged-stock warehouse needed). Voiding either one voids both.
  - Returns saved earlier get their condition filled in once by the migration (from the warehouse kind:
    damaged → broken, else resellable). It fills a new column; nothing recorded is changed.
