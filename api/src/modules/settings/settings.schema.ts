import { z } from "zod";
import { isoDateSchema } from "../../lib/dates.ts";
import { rupeesOrZeroSchema } from "../../lib/money.ts";
import { nameSchema } from "../../lib/text.ts";

export const settingsBody = z.object({
  businessName: nameSchema,
  businessStartDate: isoDateSchema,
  openingCash: rupeesOrZeroSchema,
  openingOnline: rupeesOrZeroSchema,
});
export type SettingsInput = z.infer<typeof settingsBody>;

export const settingsResponse = z.object({
  businessName: z.string(),
  businessStartDate: z.string(),
  openingCashPaise: z.number().int(),
  openingOnlinePaise: z.number().int(),
});
export type SettingsDto = z.infer<typeof settingsResponse>;
