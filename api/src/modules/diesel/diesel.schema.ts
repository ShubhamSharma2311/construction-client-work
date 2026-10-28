import { z } from "zod";
import { dateRangeSchema } from "../../lib/dates.ts";

export const dieselReportQuery = dateRangeSchema;
export type DieselReportQuery = z.infer<typeof dieselReportQuery>;

const usage = {
  litres: z.number(),
  amountPaise: z.number().int(),
  trips: z.number().int(),
};

export const dieselReportResponse = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  tractors: z.array(
    z.object({
      tractor: z.object({ id: z.number().int(), regNumber: z.string(), label: z.string() }),
      ...usage,
      /** Null when the tractor ran no trips; a high value is worth asking about. */
      litresPerTrip: z.number().nullable(),
    }),
  ),
  drivers: z.array(
    z.object({ driver: z.object({ id: z.number().int(), name: z.string() }), ...usage }),
  ),
  totals: z.object({ litres: z.number(), amountPaise: z.number().int(), trips: z.number().int() }),
});
export type DieselReport = z.infer<typeof dieselReportResponse>;
