import { describe, expect, it } from "vitest";
import { destinationWarehouses, sourceWarehouses } from "./warehouse-options";

const W = [
  { id: "main", name: "Riyadh Main", kind: "SELLABLE" as const, writable: true },
  { id: "jed", name: "Jeddah", kind: "SELLABLE" as const, writable: false },
  { id: "dmg", name: "Damaged", kind: "DAMAGED" as const, writable: false },
  { id: "dmg2", name: "Damaged 2", kind: "DAMAGED" as const, writable: true },
];
const ids = (ws: { id: string }[]) => ws.map((w) => w.id);

describe("sourceWarehouses", () => {
  it("offers only writable warehouses, and only sellable ones for sales (Q4)", () => {
    expect(ids(sourceWarehouses(W, "SUPPLIER_DELIVERY", ""))).toEqual(["main", "dmg2"]);
    expect(ids(sourceWarehouses(W, "WEBSITE_ORDER", ""))).toEqual(["main"]);
    expect(ids(sourceWarehouses(W, "TRANSFER", ""))).toEqual(["main", "dmg2"]);
  });

  it("routes customer returns by condition (Q2)", () => {
    expect(ids(sourceWarehouses(W, "CUSTOMER_RETURN", "RESELLABLE"))).toEqual(["main"]);
    expect(ids(sourceWarehouses(W, "CUSTOMER_RETURN", "DAMAGED"))).toEqual(["dmg", "dmg2"]);
  });

  it("allows any other warehouse as a transfer destination (Q1)", () => {
    expect(ids(destinationWarehouses(W, "main"))).toEqual(["jed", "dmg", "dmg2"]);
  });
});
