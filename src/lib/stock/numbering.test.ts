import { describe, expect, it } from "vitest";
import { counterKeyFor, formatEntryNumber, isOutgoing } from "./numbering";

describe("formatEntryNumber", () => {
  it("pads to six digits", () => {
    expect(formatEntryNumber("IN", 123)).toBe("IN-000123");
    expect(formatEntryNumber("OUT", 456)).toBe("OUT-000456");
    expect(formatEntryNumber("COR", 5)).toBe("COR-000005");
  });

  it("does not truncate numbers beyond six digits", () => {
    expect(formatEntryNumber("IN", 1234567)).toBe("IN-1234567");
  });

  it("gives the two halves of a transfer distinct numbers from one counter value", () => {
    expect(formatEntryNumber("TRF", 12, "TRANSFER_OUT")).toBe("TRF-000012");
    expect(formatEntryNumber("TRF", 12, "TRANSFER_IN")).toBe("TRF-000012-IN");
  });

  it("rejects invalid counter values", () => {
    expect(() => formatEntryNumber("IN", 0)).toThrow();
    expect(() => formatEntryNumber("IN", -1)).toThrow();
    expect(() => formatEntryNumber("IN", 1.5)).toThrow();
  });
});

describe("counterKeyFor", () => {
  it("maps entry types to counters", () => {
    expect(counterKeyFor("IN")).toBe("IN");
    expect(counterKeyFor("OUT")).toBe("OUT");
    expect(counterKeyFor("TRANSFER_OUT")).toBe("TRF");
    expect(counterKeyFor("TRANSFER_IN")).toBe("TRF");
    expect(counterKeyFor("CORRECTION_IN")).toBe("COR");
    expect(counterKeyFor("CORRECTION_OUT")).toBe("COR");
    expect(counterKeyFor("VOID")).toBe("VOID");
  });
});

describe("isOutgoing", () => {
  it("is true only for types that remove stock", () => {
    expect(isOutgoing("OUT")).toBe(true);
    expect(isOutgoing("TRANSFER_OUT")).toBe(true);
    expect(isOutgoing("CORRECTION_OUT")).toBe(true);
    expect(isOutgoing("IN")).toBe(false);
    expect(isOutgoing("TRANSFER_IN")).toBe(false);
    expect(isOutgoing("CORRECTION_IN")).toBe(false);
  });
});
