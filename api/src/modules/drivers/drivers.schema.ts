import { z } from "zod";
import { isoDateSchema, isoMonthSchema } from "../../lib/dates.ts";
import { dbIdSchema, nonEmptyPatch } from "../../lib/request-schemas.ts";
import { rupeesSchema } from "../../lib/money.ts";
import { phoneSchema } from "../../lib/phone.ts";
import { nameSchema } from "../../lib/text.ts";

export const driverCreateBody = z.object({
  name: nameSchema,
  phone: phoneSchema.nullable().optional(),
  joinedOn: isoDateSchema,
  monthlySalary: rupeesSchema,
  defaultTractorId: dbIdSchema.nullable().optional(),
});
export type DriverCreateInput = z.infer<typeof driverCreateBody>;

export const driverUpdateBody = nonEmptyPatch({
  name: nameSchema.optional(),
  phone: phoneSchema.nullable().optional(),
  joinedOn: isoDateSchema.optional(),
  leftOn: isoDateSchema.nullable().optional(),
  defaultTractorId: dbIdSchema.nullable().optional(),
  isActive: z.boolean().optional(),
});
export type DriverUpdateInput = z.infer<typeof driverUpdateBody>;

export const salaryRateBody = z.object({
  effectiveFrom: isoMonthSchema,
  monthlySalary: rupeesSchema,
});
export type SalaryRateInput = z.infer<typeof salaryRateBody>;

export const salaryRateParams = z.object({ id: dbIdSchema, rateId: dbIdSchema });

export const driverDto = z.object({
  id: z.number().int(),
  name: z.string(),
  phone: z.string().nullable(),
  joinedOn: z.string(),
  leftOn: z.string().nullable(),
  isActive: z.boolean(),
  defaultTractor: z
    .object({ id: z.number().int(), regNumber: z.string(), label: z.string() })
    .nullable(),
  /** Rate in effect this month; null only before the driver's first rate starts. */
  currentMonthlyPaise: z.number().int().nullable(),
  salaryRates: z.array(
    z.object({ id: z.number().int(), effectiveFrom: z.string(), monthlyPaise: z.number().int() }),
  ),
});
export type DriverDto = z.infer<typeof driverDto>;

export const driverUpdatedResponse = z.object({ driver: driverDto, warnings: z.array(z.string()) });
export type DriverUpdated = z.infer<typeof driverUpdatedResponse>;
