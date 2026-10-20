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
      supplierId: "suppliers.errors.required",
      reference: "validation.required",
    });
    expect(errors(base({ reason: "SUPPLIER_DELIVERY", supplierId: "sup1", reference: "INV-1" }))).toEqual({});
  });

  it("needs the order no., the condition and a reason for a customer return", () => {
    expect(errors(base({ reason: "CUSTOMER_RETURN" }))).toEqual({
      reference: "entryForm.errors.orderRequired",
      returnCondition: "validation.required",
      reasonCode: "validation.required",
    });
    expect(errors(base({ reason: "CUSTOMER_RETURN", reference: "12345", returnCondition: "BROKEN", reasonCode: "DEFECTIVE" }))).toEqual({});
  });

  it("checks website order numbers, direct-sale payment and the photo for broken items", () => {
    expect(errors(base({ direction: "OUT", reason: "WEBSITE_ORDER", reference: "ABC" }))).toEqual({ reference: "entryForm.errors.websiteOrder" });
    expect(errors(base({ direction: "OUT", reason: "WEBSITE_ORDER", reference: "#12345" }))).toEqual({});
    expect(errors(base({ direction: "OUT", reason: "DIRECT_SALE", customerName: "A", customerPhone: "0501234567" }))).toEqual({
      paymentMethod: "validation.required",
    });
    expect(errors(base({ direction: "OUT", reason: "DAMAGED_LOST", note: "x", reasonCode: "BROKEN_WAREHOUSE" }))).toEqual({
      photoUrls: "entryForm.errors.photoRequired",
    });
    expect(errors(base({ direction: "OUT", reason: "DAMAGED_LOST", note: "x", reasonCode: "MISSING" }))).toEqual({});
  });

  it("requires a note for corrections and damaged/lost", () => {
    expect(errors(base({ reason: "CORRECTION" }))).toEqual({ note: "validation.required" });
    expect(errors(base({ direction: "OUT", reason: "DAMAGED_LOST", reasonCode: "MISSING" }))).toEqual({ note: "validation.required" });
  });

  it("validates the out reasons' own fields", () => {
    expect(errors(base({ direction: "OUT", reason: "WEBSITE_ORDER" }))).toEqual({ reference: "validation.required" });
    expect(errors(base({ direction: "OUT", reason: "DIRECT_SALE", customerName: "A", customerPhone: "12", paymentMethod: "CASH" }))).toEqual({
      customerPhone: "validation.phone",
    });
    expect(errors(base({ direction: "OUT", reason: "INSTALLATION", customerName: "A" }))).toEqual({
      technicianName: "validation.required",
    });
    expect(errors(base({ direction: "OUT", reason: "TRANSFER", destinationWarehouseId: "w1" }))).toEqual({
      destinationWarehouseId: "stock.errors.sameWarehouse",
    });
    expect(errors(base({ direction: "OUT", reason: "SUPPLIER_RETURN" }))).toEqual({ supplierId: "suppliers.errors.required", reasonCode: "validation.required" });
    expect(errors(base({ direction: "OUT", reason: "SUPPLIER_RETURN", supplierId: "s1", reasonCode: "DEFECTIVE" }))).toEqual({});
    expect(errors(base({ direction: "OUT", reason: "SUPPLIER_RETURN", supplierId: "s1", reasonCode: "WRONG_SIZE" }))).toEqual({ reasonCode: "validation.required" });
  });

  it("Noon and Amazon orders need an order number that looks like one (plan channels-returns)", () => {
    expect(errors(base({ direction: "OUT", reason: "NOON_ORDER" }))).toEqual({ reference: "validation.required" });
    expect(errors(base({ direction: "OUT", reason: "AMAZON_ORDER", reference: "x!" }))).toEqual({ reference: "entryForm.errors.marketplaceOrder" });
    expect(errors(base({ direction: "OUT", reason: "NOON_ORDER", reference: "nae 1234567" }))).toEqual({});
    expect(errors(base({ direction: "OUT", reason: "AMAZON_ORDER", reference: "171-1234567-1234567" }))).toEqual({});
  });

  it("a return whose reason is 'other' needs a note; conditions are resellable / broken / trashed", () => {
    const ret = { reason: "CUSTOMER_RETURN", reference: "12345", returnCondition: "TRASHED" as const };
    expect(errors(base({ ...ret, reasonCode: "OTHER" }))).toEqual({ note: "validation.required" });
    expect(errors(base({ ...ret, reasonCode: "OTHER", note: "scratched box" }))).toEqual({});
    expect(errors(base({ direction: "OUT", reason: "SUPPLIER_RETURN", supplierId: "s1", reasonCode: "OTHER" }))).toEqual({ note: "validation.required" });
    expect(errors(base({ ...ret, returnCondition: "DAMAGED" as never, reasonCode: "DEFECTIVE" }))).toHaveProperty("returnCondition");
  });

  it("normalises Saudi phone numbers with Arabic digits and spaces", () => {
    const r = entryFormSchema.parse(base({ direction: "OUT", reason: "DIRECT_SALE", customerName: "A", customerPhone: "٠٥٠ ١٢٣ ٤٥٦٧", paymentMethod: "CARD" }));
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
