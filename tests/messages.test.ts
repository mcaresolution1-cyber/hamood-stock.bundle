import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import ar from "../messages/ar.json";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("translations", () => {
  it("en and ar have exactly the same keys", () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });

  it("has no empty strings", () => {
    const empty = (obj: Record<string, unknown>) =>
      keys(obj).filter((k) => k.split(".").reduce<unknown>((o, p) => (o as never)[p], obj) === "");
    expect(empty(en)).toEqual([]);
    expect(empty(ar)).toEqual([]);
  });
});
