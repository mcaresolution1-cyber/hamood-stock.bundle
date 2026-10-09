import { describe, expect, it } from "vitest";
import { directionOf, mergeLines, signedQuantity } from "./lines";

describe("mergeLines", () => {
  it("sums duplicate products and sorts by product id", () => {
    expect(
      mergeLines([
        { productId: "b", quantity: 2 },
        { productId: "a", quantity: 1 },
        { productId: "b", quantity: 3 },
      ]),
    ).toEqual([
      { productId: "a", quantity: 1 },
      { productId: "b", quantity: 5 },
    ]);
  });

  it("rejects zero, negative and fractional quantities", () => {
    expect(() => mergeLines([{ productId: "a", quantity: 0 }])).toThrow();
    expect(() => mergeLines([{ productId: "a", quantity: -1 }])).toThrow();
    expect(() => mergeLines([{ productId: "a", quantity: 1.5 }])).toThrow();
  });
});

describe("directionOf / signedQuantity", () => {
  it("is +1 for stock coming in and -1 for stock going out", () => {
    expect(directionOf("IN")).toBe(1);
    expect(directionOf("TRANSFER_IN")).toBe(1);
    expect(directionOf("CORRECTION_IN")).toBe(1);
    expect(directionOf("OUT")).toBe(-1);
    expect(directionOf("TRANSFER_OUT")).toBe(-1);
    expect(directionOf("CORRECTION_OUT")).toBe(-1);
  });

  it("reverses the voided entry's direction for VOID", () => {
    expect(signedQuantity(4, "VOID", "IN")).toBe(-4);
    expect(signedQuantity(4, "VOID", "OUT")).toBe(4);
    expect(signedQuantity(4, "VOID", "TRANSFER_IN")).toBe(-4);
    expect(() => directionOf("VOID")).toThrow();
    expect(() => directionOf("VOID", "VOID")).toThrow();
  });
});
