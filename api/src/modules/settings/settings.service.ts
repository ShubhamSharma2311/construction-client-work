import type { Setting } from "../../generated/prisma/client.ts";
import { writeAudit } from "../../lib/audit.ts";
import { fromDbDate, toDbDate, todayIST, type BusinessDateBounds } from "../../lib/dates.ts";
import { AppError } from "../../lib/errors.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import type { SettingsDto, SettingsInput } from "./settings.schema.ts";

const SETTINGS_ID = 1;

function toDto(row: Setting): SettingsDto {
  return {
    businessName: row.businessName,
    businessStartDate: fromDbDate(row.businessStartDate),
    openingCashPaise: row.openingCashPaise,
    openingOnlinePaise: row.openingOnlinePaise,
  };
}

export async function getSettings(db: Db): Promise<SettingsDto> {
  const row = await db.setting.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) throw new AppError("NOT_FOUND", "Business settings are not set up yet");
  return toDto(row);
}

export async function saveSettings(db: Db, input: SettingsInput, now: Date): Promise<SettingsDto> {
  const today = todayIST(now);
  if (input.businessStartDate > today) {
    throw new AppError(
      "VALIDATION",
      `Business start date ${input.businessStartDate} is in the future`,
    );
  }
  const data = {
    businessName: input.businessName,
    businessStartDate: toDbDate(input.businessStartDate),
    openingCashPaise: input.openingCash,
    openingOnlinePaise: input.openingOnline,
  };

  return db.$transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { id: SETTINGS_ID } });
    const saved = await tx.setting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
    await writeAudit(tx, {
      entity: "Setting",
      entityId: SETTINGS_ID,
      action: before ? "UPDATE" : "CREATE",
      before: before ? toDto(before) : null,
      after: toDto(saved),
    });
    return toDto(saved);
  });
}

/** The date window every dated entry must fall in. Fails until settings exist. */
export async function getBusinessBounds(db: Db | Tx, now: Date): Promise<BusinessDateBounds> {
  const row = await db.setting.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) {
    throw new AppError(
      "CONFLICT",
      "Set up the business settings (name and start date) before adding entries",
    );
  }
  return { businessStartDate: fromDbDate(row.businessStartDate), today: todayIST(now) };
}
