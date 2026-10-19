import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isDay, riyadhDay, riyadhStart } from "./days";

describe("Riyadh days", () => {
  it("puts a moment on its Riyadh day (UTC+3)", () => {
    expect(riyadhDay(new Date("2026-10-18T20:59:59Z"))).toBe("2026-10-18");
    expect(riyadhDay(new Date("2026-10-18T21:00:00Z"))).toBe("2026-10-19");
    expect(riyadhStart("2026-10-19").toISOString()).toBe("2026-10-18T21:00:00.000Z");
  });

  it("walks days across month ends and checks day text", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(daysBetween("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(daysBetween("2026-03-02", "2026-03-01")).toEqual([]);
    expect([isDay("2026-02-28"), isDay("2026-02-30"), isDay("19/10/2026"), isDay(undefined)]).toEqual([true, false, false, false]);
  });
});
