import type { Prisma } from "../../generated/prisma/client.ts";
import { toCsv, type CsvColumn } from "../../lib/csv.ts";
import { dayFilter } from "../../lib/dates.ts";
import { paiseToRupeeString } from "../../lib/money.ts";
import type { Db } from "../../lib/prisma.ts";
import type { DieselReport, DieselReportQuery } from "./diesel.schema.ts";

const toLitres = (ml: number) => ml / 1000;

interface Usage {
  ml: number;
  amountPaise: number;
  trips: number;
}

const NO_USAGE: Usage = { ml: 0, amountPaise: 0, trips: 0 };

function addUsage(map: Map<number, Usage>, id: number | null, change: Partial<Usage>): void {
  if (id === null) return;
  const current = map.get(id) ?? NO_USAGE;
  map.set(id, {
    ml: current.ml + (change.ml ?? 0),
    amountPaise: current.amountPaise + (change.amountPaise ?? 0),
    trips: current.trips + (change.trips ?? 0),
  });
}

/** Diesel filled and trips run per tractor and per driver, for spotting misuse. */
export async function dieselReport(db: Db, range: DieselReportQuery): Promise<DieselReport> {
  const days = dayFilter(range);
  const fillWhere: Prisma.ExpenseWhereInput = {
    category: "DIESEL",
    deletedAt: null,
    spentOn: days,
  };
  const tripWhere: Prisma.TripWhereInput = { kind: "TRIP", deletedAt: null, tripDate: days };

  const [fillsByTractor, fillsByDriver, tripsByTractor, tripsByDriver] = await db.$transaction(
    [
      db.expense.groupBy({
        by: ["tractorId"],
        where: fillWhere,
        _sum: { dieselMl: true, amountPaise: true },
        orderBy: { tractorId: "asc" },
      }),
      db.expense.groupBy({
        by: ["driverId"],
        where: fillWhere,
        _sum: { dieselMl: true, amountPaise: true },
        orderBy: { driverId: "asc" },
      }),
      db.trip.groupBy({
        by: ["tractorId"],
        where: tripWhere,
        _count: { _all: true },
        orderBy: { tractorId: "asc" },
      }),
      db.trip.groupBy({
        by: ["driverId"],
        where: tripWhere,
        _count: { _all: true },
        orderBy: { driverId: "asc" },
      }),
    ],
    { isolationLevel: "RepeatableRead" },
  );

  const tractorUsage = new Map<number, Usage>();
  const driverUsage = new Map<number, Usage>();
  for (const row of fillsByTractor) {
    addUsage(tractorUsage, row.tractorId, {
      ml: row._sum.dieselMl ?? 0,
      amountPaise: row._sum.amountPaise ?? 0,
    });
  }
  for (const row of fillsByDriver) {
    addUsage(driverUsage, row.driverId, {
      ml: row._sum.dieselMl ?? 0,
      amountPaise: row._sum.amountPaise ?? 0,
    });
  }
  for (const row of tripsByTractor)
    addUsage(tractorUsage, row.tractorId, { trips: row._count._all });
  for (const row of tripsByDriver) addUsage(driverUsage, row.driverId, { trips: row._count._all });

  const [tractors, drivers] = await Promise.all([
    db.tractor.findMany({
      where: { id: { in: [...tractorUsage.keys()] } },
      orderBy: { regNumber: "asc" },
    }),
    db.driver.findMany({
      where: { id: { in: [...driverUsage.keys()] } },
      orderBy: { name: "asc" },
    }),
  ]);

  // Totals come from every group, so a row missing a tractor still counts.
  const sum = <Row>(rows: Row[], value: (row: Row) => number) =>
    rows.reduce((total, row) => total + value(row), 0);
  return {
    from: range.from ?? null,
    to: range.to ?? null,
    tractors: tractors.map((tractor) => {
      const used = tractorUsage.get(tractor.id) ?? NO_USAGE;
      return {
        tractor: { id: tractor.id, regNumber: tractor.regNumber, label: tractor.label },
        litres: toLitres(used.ml),
        amountPaise: used.amountPaise,
        trips: used.trips,
        litresPerTrip: used.trips > 0 ? Math.round(used.ml / used.trips / 10) / 100 : null,
      };
    }),
    drivers: drivers.map((driver) => {
      const used = driverUsage.get(driver.id) ?? NO_USAGE;
      return {
        driver: { id: driver.id, name: driver.name },
        litres: toLitres(used.ml),
        amountPaise: used.amountPaise,
        trips: used.trips,
      };
    }),
    totals: {
      litres: toLitres(sum(fillsByTractor, (row) => row._sum.dieselMl ?? 0)),
      amountPaise: sum(fillsByTractor, (row) => row._sum.amountPaise ?? 0),
      trips: sum(tripsByTractor, (row) => row._count._all),
    },
  };
}

interface DieselCsvRow {
  type: "Tractor" | "Driver";
  name: string;
  litres: number;
  amountPaise: number;
  trips: number;
  litresPerTrip: number | null;
}

const columns: CsvColumn<DieselCsvRow>[] = [
  { header: "Type", value: (row) => row.type },
  { header: "Tractor / driver", value: (row) => row.name },
  { header: "Diesel (L)", value: (row) => row.litres },
  { header: "Diesel (Rs)", value: (row) => paiseToRupeeString(row.amountPaise) },
  { header: "Trips", value: (row) => row.trips },
  { header: "Litres per trip", value: (row) => row.litresPerTrip },
];

/** One sheet with the tractor rows first, then the driver rows. */
export function dieselReportToCsv(report: DieselReport): string {
  const rows: DieselCsvRow[] = [
    ...report.tractors.map((row) => ({
      type: "Tractor" as const,
      name: `${row.tractor.regNumber} (${row.tractor.label})`,
      litres: row.litres,
      amountPaise: row.amountPaise,
      trips: row.trips,
      litresPerTrip: row.litresPerTrip,
    })),
    ...report.drivers.map((row) => ({
      type: "Driver" as const,
      name: row.driver.name,
      litres: row.litres,
      amountPaise: row.amountPaise,
      trips: row.trips,
      litresPerTrip: null,
    })),
  ];
  return toCsv(columns, rows);
}
