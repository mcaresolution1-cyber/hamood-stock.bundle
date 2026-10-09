import { z } from "zod";
import { requiredText } from "./common";

export const warehouseSchema = z.object({
  name: requiredText(100),
  city: requiredText(100),
  kind: z.enum(["SELLABLE", "DAMAGED"], { message: "validation.required" }),
});

export type WarehouseFormValues = z.input<typeof warehouseSchema>;
export type WarehouseInput = z.output<typeof warehouseSchema>;
