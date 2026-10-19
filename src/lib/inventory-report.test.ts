import { describe, expect, it } from "vitest";
import { parseReportParams, presetRange, reportQuery } from "./inventory-report";

describe("inventory report settings", () => {
  const today = "2026-03-15";
  it("turns presets into days", () => {
    expect(presetRange("today", today)).toEqual({ from: today, to: today });
    expect(presetRange("yesterday", today)).toEqual({ from: "2026-03-14", to: "2026-03-14" });
    expect(presetRange("last7", today)).toEqual({ from: "2026-03-09", to: today });
    expect(presetRange("thisMonth", today)).toEqual({ from: "2026-03-01", to: today });
    expect(presetRange("lastMonth", today)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(presetRange("lastMonth", "2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("reads the URL safely", () => {
    expect(parseReportParams({}, today)).toEqual({ from: "2026-03-01", to: today, lang: "en", showAll: false, warehouseId: undefined, categoryId: undefined });
    expect(parseReportParams({ from: "2026-03-10", to: "2026-03-02", lang: "ar", warehouse: "w1", category: "x y", all: "1" }, today)).toEqual({
      from: "2026-03-02",
      to: "2026-03-10",
      lang: "ar",
      showAll: true,
      warehouseId: "w1",
      categoryId: undefined,
    });
    // future end → today; more than a year → the last 366 days
    expect(parseReportParams({ from: "2020-01-01", to: "2030-01-01" }, today)).toMatchObject({ from: "2025-03-15", to: today });
  });

  it("round-trips through the query string", () => {
    const p = parseReportParams({ from: "2026-03-01", to: "2026-03-10", warehouse: "w1", lang: "ar", all: "1" }, today);
    expect(parseReportParams(Object.fromEntries(new URLSearchParams(reportQuery(p))), today)).toEqual(p);
  });
});
