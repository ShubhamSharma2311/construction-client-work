import type { Setting } from "../../generated/prisma/client.ts";
import { writeAudit } from "../../lib/audit.ts";
import {
  fromDbDate,
  toDbDate,
  todayIST,
  type BusinessDateBounds,
  type IsoDate,
} from "../../lib/dates.ts";
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
    if (before)
      await moveBusinessStart(tx, fromDbDate(before.businessStartDate), input.businessStartDate);
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

/**
 * Moving the start later must not strand entries before it. Opening balances (customers'
 * and drivers') are dated the start by definition, so they move with it.
 */
async function moveBusinessStart(tx: Tx, from: IsoDate, to: IsoDate): Promise<void> {
  if (from === to) return;
  if (to > from) {
    const earliest = await earliestEntryDate(tx);
    if (earliest && earliest < to) {
      throw new AppError(
        "CONFLICT",
        `Entries exist from ${earliest}; the business start date cannot move after them`,
        { earliestEntryDate: earliest },
      );
    }
  }
  const driverOpenings = await tx.driverAccrual.findMany({ where: { kind: "OPENING_BALANCE" } });
  for (const opening of driverOpenings) {
    const moved = await tx.driverAccrual.update({
      where: { id: opening.id },
      data: { accruedOn: toDbDate(to) },
    });
    await writeAudit(tx, {
      entity: "DriverAccrual",
      entityId: opening.id,
      action: "UPDATE",
      before: opening,
      after: moved,
    });
  }
  const openings = await tx.trip.findMany({ where: { kind: "OPENING_BALANCE" } });
  for (const opening of openings) {
    const moved = await tx.trip.update({
      where: { id: opening.id },
      data: { tripDate: toDbDate(to) },
    });
    await writeAudit(tx, {
      entity: "Trip",
      entityId: opening.id,
      action: "UPDATE",
      before: opening,
      after: moved,
    });
  }
}

/** Oldest live dated entry. Every table with a business date must be listed here. */
async function earliestEntryDate(tx: Tx): Promise<IsoDate | null> {
  // SQLite hands back an aggregate of dates as their stored ISO text.
  const [row] = await tx.$queryRaw<{ earliest: string | null }[]>`
    SELECT MIN(day) AS earliest FROM (
      SELECT MIN("tripDate") AS day FROM "Trip" WHERE "deletedAt" IS NULL AND "kind" = 'TRIP'
      UNION ALL
      SELECT MIN("paidOn") FROM "CustomerPayment" WHERE "deletedAt" IS NULL
      UNION ALL
      SELECT MIN("spentOn") FROM "Expense" WHERE "deletedAt" IS NULL
      UNION ALL
      SELECT MIN("paidOn") FROM "DriverPayment" WHERE "deletedAt" IS NULL
      UNION ALL
      SELECT MIN("accruedOn") FROM "DriverAccrual"
        WHERE "deletedAt" IS NULL AND "kind" <> 'OPENING_BALANCE'
      UNION ALL
      SELECT MIN("txnDate") FROM "PartnerTxn" WHERE "deletedAt" IS NULL
    ) AS dated`;
  return row?.earliest ? fromDbDate(new Date(row.earliest)) : null;
}

/**
 * The date window every dated entry must fall in. Fails until settings exist. Inside a
 * transaction the share lock keeps the start date fixed until the entry is saved.
 */
export async function getBusinessBounds(db: Db | Tx, now: Date): Promise<BusinessDateBounds> {
  const [row] = await db.$queryRaw<{ businessStartDate: Date }[]>`
    SELECT "businessStartDate" FROM "Setting" WHERE id = ${SETTINGS_ID}`;
  if (!row) {
    throw new AppError(
      "CONFLICT",
      "Set up the business settings (name and start date) before adding entries",
    );
  }
  return { businessStartDate: fromDbDate(row.businessStartDate), today: todayIST(now) };
}
