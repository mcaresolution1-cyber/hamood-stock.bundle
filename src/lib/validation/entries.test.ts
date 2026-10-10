import { describe, expect, it } from "vitest";
import { emptyEntryForm, entryFormSchema, type EntryFormValues } from "./entries";

const base = (over: Partial<EntryFormValues>): EntryFormValues => ({
  ...emptyEntryForm(over.direction ?? "IN"),
  warehouseId: "w1",
  lines: [{ productId: "p1", quantity: "2" }],
  ...over,
});
const errors = (v: EntryFormValues) => {
  const r = entryFormSchema.safeParse(v);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
};

describe("entryFormSchema", () => {
  it("requires supplier and invoice for a supplier delivery", () => {
    expect(errors(base({ reason: "SUPPLIER_DELIVERY" }))).toEqual({
      supplierName: "validation.required",
      reference: "validation.required",
    });
    expect(errors(base({ reason: "SUPPLIER_DELIVERY", supplierName: "Acme", reference: "INV-1" }))).toEqual({});
  });

  it("needs order no. or customer name, and the condition, for a customer return", () => {
    expect(errors(base({ reason: "CUSTOMER_RETURN" }))).toEqual({
      reference: "entryForm.errors.orderOrCustomer",
      returnCondition: "validation.required",
    });
    expect(errors(base({ reason: "CUSTOMER_RETURN", customerName: "Khalid", returnCondition: "DAMAGED" }))).toEqual({});
  });

  it("requires a note for corrections and damaged/lost", () => {
    expect(errors(base({ reason: "CORRECTION" }))).toEqual({ note: "validation.required" });
    expect(errors(base({ direction: "OUT", reason: "DAMAGED_LOST" }))).toEqual({ note: "validation.required" });
  });

  it("validates the out reasons' own fields", () => {
    expect(errors(base({ direction: "OUT", reason: "WEBSITE_ORDER" }))).toEqual({ reference: "validation.required" });
    expect(errors(base({ direction: "OUT", reason: "DIRECT_SALE", customerName: "A", customerPhone: "12" }))).toEqual({
      customerPhone: "validation.phone",
    });
    expect(errors(base({ direction: "OUT", reason: "INSTALLATION", customerName: "A" }))).toEqual({
      technicianName: "validation.required",
    });
    expect(errors(base({ direction: "OUT", reason: "TRANSFER", destinationWarehouseId: "w1" }))).toEqual({
      destinationWarehouseId: "stock.errors.sameWarehouse",
    });
    expect(errors(base({ direction: "OUT", reason: "SUPPLIER_RETURN" }))).toEqual({ supplierName: "validation.required" });
  });

  it("normalises Saudi phone numbers with Arabic digits and spaces", () => {
    const r = entryFormSchema.parse(base({ direction: "OUT", reason: "DIRECT_SALE", customerName: "A", customerPhone: "٠٥٠ ١٢٣ ٤٥٦٧" }));
    expect(r.customerPhone).toBe("0501234567");
  });

  it("rejects reasons in the wrong direction, opening stock, and bad lines", () => {
    expect(errors(base({ direction: "IN", reason: "WEBSITE_ORDER", reference: "x" }))).toEqual({ reason: "entryForm.errors.reasonRequired" });
    expect(errors(base({ reason: "OPENING_STOCK" }))).toEqual({ reason: "entryForm.errors.reasonRequired" });
    expect(errors(base({ reason: "CORRECTION", note: "n", lines: [] }))).toEqual({ lines: "stock.errors.noLines" });
    expect(errors(base({ reason: "CORRECTION", note: "n", lines: [{ productId: "p", quantity: "0" }] }))).toEqual({
      "lines.0.quantity": "validation.positiveWhole",
    });
    expect(errors(base({ reason: "CORRECTION", note: "n", lines: [{ productId: "p", quantity: "2.5" }] }))).toEqual({
      "lines.0.quantity": "validation.positiveWhole",
    });
  });

  it("only accepts photo URLs pointing at our attachment route", () => {
    expect(errors(base({ reason: "CORRECTION", note: "n", photoUrl: "https://evil.example/x.jpg" }))).toEqual({ photoUrl: "validation.photo" });
    expect(errors(base({ reason: "CORRECTION", note: "n", photoUrl: "javascript:alert(1)" }))).toEqual({ photoUrl: "validation.photo" });
    expect(errors(base({ reason: "CORRECTION", note: "n", photoUrl: "/api/attachments/cmabc1234567890" }))).toEqual({});
  });
});
