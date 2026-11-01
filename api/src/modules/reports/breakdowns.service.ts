import { dayFilter, type ClosedRange } from "../../lib/dates.ts";
import type { Db } from "../../lib/prisma.ts";
import type { DriverReport, KhetReport, TractorReport } from "./reports.schema.ts";

/** Each tractor's trips and revenue against the costs booked to it: diesel, service, EMI, other. */
export async function tractorReport(db: Db, range: ClosedRange): Promise<TractorReport> {
  const days = dayFilter(range);
  const [trips, costs, tractors] = await db.$transaction([
    db.trip.groupBy({
      by: ["tractorId"],
      where: { kind: "TRIP", deletedAt: null, tripDate: days },
      _sum: { amountPaise: true },
      _count: { _all: true },
      orderBy: { tractorId: "asc" },
    }),
    db.expense.groupBy({
      by: ["tractorId", "category"],
      where: { deletedAt: null, spentOn: days, tractorId: { not: null } },
      _sum: { amountPaise: true },
      orderBy: [{ tractorId: "asc" }, { category: "asc" }],
    }),
    db.tractor.findMany({ orderBy: { regNumber: "asc" } }),
  ]);
  const costFor = (tractorId: number, categories: readonly string[]) =>
    costs
      .filter((row) => row.tractorId === tractorId && categories.includes(row.category))
      .reduce((sum, row) => sum + (row._sum.amountPaise ?? 0), 0);
  const rows = tractors
    .map((tractor) => {
      const tripRow = trips.find((row) => row.tractorId === tractor.id);
      const revenuePaise = tripRow?._sum.amountPaise ?? 0;
      const dieselPaise = costFor(tractor.id, ["DIESEL"]);
      const servicePaise = costFor(tractor.id, ["TRACTOR_SERVICE"]);
      const emiPaise = costFor(tractor.id, ["TRACTOR_EMI"]);
      const otherPaise = costFor(tractor.id, ["EMERGENCY"]);
      return {
        tractor: { id: tractor.id, regNumber: tractor.regNumber, label: tractor.label },
        trips: tripRow?._count._all ?? 0,
        revenuePaise,
        dieselPaise,
        servicePaise,
        emiPaise,
        otherPaise,
        contributionPaise: revenuePaise - dieselPaise - servicePaise - emiPaise - otherPaise,
      };
    })
    // Show a tractor if it ran trips or had costs in the range.
    .filter(
      (row) =>
        row.trips > 0 || row.dieselPaise + row.servicePaise + row.emiPaise + row.otherPaise > 0,
    );
  return { from: range.from, to: range.to, tractors: rows };
}

/** Trips and revenue by the field the sand came from. */
export async function khetReport(db: Db, range: ClosedRange): Promise<KhetReport> {
  const [trips, khets] = await db.$transaction([
    db.trip.groupBy({
      by: ["khetId"],
      where: { kind: "TRIP", deletedAt: null, tripDate: dayFilter(range) },
      _sum: { amountPaise: true },
      _count: { _all: true },
      orderBy: { khetId: "asc" },
    }),
    db.khet.findMany({ orderBy: { nameKey: "asc" } }),
  ]);
  const rows = khets.flatMap((khet) => {
    const row = trips.find((trip) => trip.khetId === khet.id);
    return row
      ? [
          {
            khet: { id: khet.id, name: khet.name },
            trips: row._count._all,
            revenuePaise: row._sum.amountPaise ?? 0,
          },
        ]
      : [];
  });
  return { from: range.from, to: range.to, khets: rows };
}

/** Per driver: trips run, diesel filled, salary earned, and advances and salary paid. */
export async function driverReport(db: Db, range: ClosedRange): Promise<DriverReport> {
  const days = dayFilter(range);
  const [trips, diesel, earned, paid, drivers] = await db.$transaction([
    db.trip.groupBy({
      by: ["driverId"],
      where: { kind: "TRIP", deletedAt: null, tripDate: days },
      _sum: { amountPaise: true },
      _count: { _all: true },
      orderBy: { driverId: "asc" },
    }),
    db.expense.groupBy({
      by: ["driverId"],
      where: { category: "DIESEL", deletedAt: null, spentOn: days },
      _sum: { amountPaise: true, dieselMl: true },
      orderBy: { driverId: "asc" },
    }),
    db.driverAccrual.groupBy({
      by: ["driverId"],
      where: { kind: { in: ["MONTH_SALARY", "BONUS"] }, deletedAt: null, accruedOn: days },
      _sum: { amountPaise: true },
      orderBy: { driverId: "asc" },
    }),
    db.driverPayment.groupBy({
      by: ["driverId", "type"],
      where: { deletedAt: null, paidOn: days },
      _sum: { amountPaise: true },
      orderBy: [{ driverId: "asc" }, { type: "asc" }],
    }),
    db.driver.findMany({ orderBy: { name: "asc" } }),
  ]);
  const rows = drivers
    .map((driver) => {
      const tripRow = trips.find((row) => row.driverId === driver.id);
      const dieselRow = diesel.find((row) => row.driverId === driver.id);
      const paidOf = (type: "ADVANCE" | "SALARY" | "BONUS") =>
        paid.find((row) => row.driverId === driver.id && row.type === type)?._sum.amountPaise ?? 0;
      return {
        driver: { id: driver.id, name: driver.name },
        trips: tripRow?._count._all ?? 0,
        revenuePaise: tripRow?._sum.amountPaise ?? 0,
        dieselLitres: (dieselRow?._sum.dieselMl ?? 0) / 1000,
        dieselPaise: dieselRow?._sum.amountPaise ?? 0,
        salaryEarnedPaise: earned.find((row) => row.driverId === driver.id)?._sum.amountPaise ?? 0,
        advancesPaise: paidOf("ADVANCE"),
        salaryPaidPaise: paidOf("SALARY") + paidOf("BONUS"),
      };
    })
    .filter((row) =>
      [
        row.trips,
        row.dieselPaise,
        row.salaryEarnedPaise,
        row.advancesPaise,
        row.salaryPaidPaise,
      ].some((value) => value !== 0),
    );
  return { from: range.from, to: range.to, drivers: rows };
}
