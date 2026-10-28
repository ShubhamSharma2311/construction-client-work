import type { Prisma } from "../../generated/prisma/client.ts";
import { writeAudit } from "../../lib/audit.ts";
import {
  fromDbDate,
  monthOf,
  monthStart,
  toDbDate,
  todayIST,
  type IsoDate,
} from "../../lib/dates.ts";
import { AppError, notFound } from "../../lib/errors.ts";
import { activeWhere, paged, type MasterListQuery, type Page } from "../../lib/listing.ts";
import { lockRow } from "../../lib/locks.ts";
import { phoneSearchTerm } from "../../lib/phone.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import type {
  DriverCreateInput,
  DriverDto,
  DriverUpdated,
  DriverUpdateInput,
  SalaryRateInput,
} from "./drivers.schema.ts";

const driverInclude = {
  defaultTractor: { select: { id: true, regNumber: true, label: true } },
  salaryRates: { orderBy: { effectiveFrom: "asc" } },
} as const satisfies Prisma.DriverInclude;
type DriverRow = Prisma.DriverGetPayload<{ include: typeof driverInclude }>;

function toDto(row: DriverRow, today: IsoDate): DriverDto {
  const rates = row.salaryRates.map((rate) => ({
    id: rate.id,
    effectiveFrom: monthOf(fromDbDate(rate.effectiveFrom)),
    monthlyPaise: rate.monthlyPaise,
  }));
  const thisMonth = monthOf(today);
  const current = rates.filter((rate) => rate.effectiveFrom <= thisMonth).at(-1);
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    joinedOn: fromDbDate(row.joinedOn),
    leftOn: row.leftOn ? fromDbDate(row.leftOn) : null,
    isActive: row.isActive,
    defaultTractor: row.defaultTractor,
    currentMonthlyPaise: current?.monthlyPaise ?? null,
    salaryRates: rates,
  };
}

export async function createDriver(
  db: Db,
  input: DriverCreateInput,
  now: Date,
): Promise<DriverDto> {
  const today = todayIST(now);
  assertDriverDates(input.joinedOn, null, today);
  return db.$transaction(async (tx) => {
    if (input.defaultTractorId) await assertTractorAssignable(tx, input.defaultTractorId, null);
    const created = await tx.driver.create({
      data: {
        name: input.name,
        phone: input.phone ?? null,
        joinedOn: toDbDate(input.joinedOn),
        defaultTractorId: input.defaultTractorId ?? null,
        // The first rate starts in the joining month, so every working month has a rate.
        salaryRates: {
          create: {
            monthlyPaise: input.monthlySalary,
            effectiveFrom: toDbDate(monthStart(monthOf(input.joinedOn))),
          },
        },
      },
      include: driverInclude,
    });
    await writeAudit(tx, {
      entity: "Driver",
      entityId: created.id,
      action: "CREATE",
      after: created,
    });
    return toDto(created, today);
  });
}

export async function listDrivers(
  db: Db,
  query: MasterListQuery,
  now: Date,
): Promise<Page<DriverDto>> {
  const where: Prisma.DriverWhereInput = { ...activeWhere(query.active) };
  if (query.search) {
    const phone = phoneSearchTerm(query.search);
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      ...(phone ? [{ phone: { contains: phone } }] : []),
    ];
  }
  const today = todayIST(now);
  return paged(
    query,
    {
      rows: (window) =>
        db.driver.findMany({ where, include: driverInclude, orderBy: { name: "asc" }, ...window }),
      count: () => db.driver.count({ where }),
    },
    (row) => toDto(row, today),
  );
}

export async function getDriver(db: Db | Tx, id: number, now: Date): Promise<DriverDto> {
  const row = await db.driver.findUnique({ where: { id }, include: driverInclude });
  if (!row) throw notFound("Driver", id);
  return toDto(row, todayIST(now));
}

/**
 * Lock order is always tractor, then driver (tractors.service deactivates a tractor and then
 * clears its driver), so concurrent edits queue instead of deadlocking.
 */
export async function updateDriver(
  db: Db,
  id: number,
  input: DriverUpdateInput,
  now: Date,
): Promise<DriverUpdated> {
  const today = todayIST(now);
  return db.$transaction(async (tx) => {
    if (input.defaultTractorId) await lockRow(tx, "Tractor", input.defaultTractorId);
    await lockRow(tx, "Driver", id);
    const before = await tx.driver.findUnique({ where: { id }, include: driverInclude });
    if (!before) throw notFound("Driver", id);

    const storedLeftOn = before.leftOn ? fromDbDate(before.leftOn) : null;
    assertDriverDates(
      input.joinedOn ?? fromDbDate(before.joinedOn),
      input.leftOn === undefined ? storedLeftOn : input.leftOn,
      today,
    );
    if (input.joinedOn) await moveFirstRateToJoinMonth(tx, before, input.joinedOn);
    const tractor = await resolveDefaultTractor(tx, before, input);

    // Prisma leaves fields that are undefined untouched; null clears an optional field.
    await tx.driver.update({
      where: { id },
      data: {
        name: input.name,
        phone: input.phone,
        isActive: input.isActive,
        joinedOn: input.joinedOn && toDbDate(input.joinedOn),
        leftOn: input.leftOn === undefined ? undefined : input.leftOn && toDbDate(input.leftOn),
        defaultTractorId: tractor.defaultTractorId,
      },
    });
    const after = await tx.driver.findUniqueOrThrow({ where: { id }, include: driverInclude });
    await writeAudit(tx, { entity: "Driver", entityId: id, action: "UPDATE", before, after });
    return { driver: toDto(after, today), warnings: tractor.warnings };
  });
}

function assertDriverDates(joinedOn: IsoDate, leftOn: IsoDate | null, today: IsoDate): void {
  if (joinedOn > today) {
    throw new AppError("VALIDATION", `Joining date ${joinedOn} is in the future`);
  }
  if (leftOn && leftOn > today) {
    throw new AppError("VALIDATION", `Leaving date ${leftOn} is in the future`);
  }
  if (leftOn && leftOn < joinedOn) {
    throw new AppError(
      "VALIDATION",
      `Leaving date ${leftOn} is before the joining date ${joinedOn}`,
    );
  }
}

/** An inactive driver has no usual tractor; an active one may take a free, active tractor. */
async function resolveDefaultTractor(
  tx: Tx,
  before: DriverRow,
  input: DriverUpdateInput,
): Promise<{ defaultTractorId: number | null | undefined; warnings: string[] }> {
  const staysActive = input.isActive ?? before.isActive;
  if (!staysActive) {
    if (input.defaultTractorId) {
      throw new AppError("CONFLICT", `${before.name} is inactive and cannot have a usual tractor`);
    }
    if (before.defaultTractor) {
      return {
        defaultTractorId: null,
        warnings: [`Tractor ${before.defaultTractor.regNumber} is now free for another driver`],
      };
    }
  }
  if (input.defaultTractorId) await assertTractorAssignable(tx, input.defaultTractorId, before.id);
  return { defaultTractorId: input.defaultTractorId, warnings: [] };
}

export async function addSalaryRate(
  db: Db,
  driverId: number,
  input: SalaryRateInput,
  now: Date,
): Promise<DriverDto> {
  return db.$transaction(async (tx) => {
    // Serialises with updateDriver, which moves the first rate when the joining date changes.
    await lockRow(tx, "Driver", driverId);
    const driver = await tx.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw notFound("Driver", driverId);
    const joinMonth = monthOf(fromDbDate(driver.joinedOn));
    if (input.effectiveFrom < joinMonth) {
      throw new AppError(
        "CONFLICT",
        `A rate cannot start in ${input.effectiveFrom}, before ${driver.name} joined (${joinMonth})`,
      );
    }
    const effectiveFrom = toDbDate(monthStart(input.effectiveFrom));
    const clash = await tx.driverSalaryRate.findUnique({
      where: { driverId_effectiveFrom: { driverId, effectiveFrom } },
    });
    if (clash) {
      throw new AppError(
        "CONFLICT",
        `${driver.name} already has a rate starting ${input.effectiveFrom}`,
      );
    }
    const rate = await tx.driverSalaryRate.create({
      data: { driverId, effectiveFrom, monthlyPaise: input.monthlySalary },
    });
    await writeAudit(tx, {
      entity: "DriverSalaryRate",
      entityId: rate.id,
      action: "CREATE",
      after: rate,
    });
    return getDriver(tx, driverId, now);
  });
}

/** The first rate anchors the joining month and cannot be removed. */
export async function deleteSalaryRate(
  db: Db,
  driverId: number,
  rateId: number,
  now: Date,
): Promise<DriverDto> {
  return db.$transaction(async (tx) => {
    await lockRow(tx, "Driver", driverId);
    const rate = await tx.driverSalaryRate.findFirst({ where: { id: rateId, driverId } });
    if (!rate) throw notFound("Salary rate", rateId);
    const first = await tx.driverSalaryRate.findFirstOrThrow({
      where: { driverId },
      orderBy: { effectiveFrom: "asc" },
    });
    if (first.id === rate.id) {
      throw new AppError(
        "CONFLICT",
        "The first salary rate starts at joining and cannot be deleted; change its amount by adding a rate instead",
      );
    }
    await tx.driverSalaryRate.delete({ where: { id: rateId } });
    await writeAudit(tx, {
      entity: "DriverSalaryRate",
      entityId: rateId,
      action: "DELETE",
      before: rate,
    });
    return getDriver(tx, driverId, now);
  });
}

async function moveFirstRateToJoinMonth(
  tx: Tx,
  driver: DriverRow,
  joinedOn: IsoDate,
): Promise<void> {
  const newMonth = monthStart(monthOf(joinedOn));
  const [first, second] = driver.salaryRates;
  if (!first || fromDbDate(first.effectiveFrom) === newMonth) return;
  if (second && fromDbDate(second.effectiveFrom) <= newMonth) {
    throw new AppError(
      "CONFLICT",
      `Joining in ${monthOf(joinedOn)} would come after the rate starting ${monthOf(fromDbDate(second.effectiveFrom))}; delete that rate first`,
    );
  }
  await tx.driverSalaryRate.update({
    where: { id: first.id },
    data: { effectiveFrom: toDbDate(newMonth) },
  });
}

async function assertTractorAssignable(
  tx: Tx,
  tractorId: number,
  driverId: number | null,
): Promise<void> {
  await lockRow(tx, "Tractor", tractorId);
  const tractor = await tx.tractor.findUnique({
    where: { id: tractorId },
    include: { defaultDriver: { select: { id: true, name: true } } },
  });
  if (!tractor) throw notFound("Tractor", tractorId);
  if (!tractor.isActive) throw new AppError("CONFLICT", `Tractor ${tractor.regNumber} is inactive`);
  if (tractor.defaultDriver && tractor.defaultDriver.id !== driverId) {
    throw new AppError(
      "CONFLICT",
      `Tractor ${tractor.regNumber} is already the usual tractor of ${tractor.defaultDriver.name}`,
    );
  }
}
