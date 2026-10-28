import { z } from "zod";
import { expenseDto } from "../expenses/expenses.schema.ts";

export const serviceHistoryResponse = z.object({
  tractor: z.object({ id: z.number().int(), regNumber: z.string(), label: z.string() }),
  lastService: z
    .object({
      date: z.string(),
      hourMeter: z.number().int().nullable(),
      notes: z.string().nullable(),
    })
    .nullable(),
  services: z.array(expenseDto),
});
export type ServiceHistory = z.infer<typeof serviceHistoryResponse>;
