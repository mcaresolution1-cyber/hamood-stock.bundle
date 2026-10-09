"use client";

import { Direction } from "radix-ui";

/** Tells Radix primitives (menus, selects, dialogs…) whether the UI is RTL. */
export function DirectionProvider({
  dir,
  children,
}: {
  dir: "ltr" | "rtl";
  children: React.ReactNode;
}) {
  return <Direction.Provider dir={dir}>{children}</Direction.Provider>;
}
