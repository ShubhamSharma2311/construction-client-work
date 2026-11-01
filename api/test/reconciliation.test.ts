import type { TestResponse } from "./response.ts";
import { describe, expect, it } from "vitest";
import { addDays, isoDateSchema, type ClosedRange, type IsoDate } from "../src/lib/dates.ts";
import type {
  Cashbook,
  Dashboard,
  DriverReport,
  KhetReport,
  PartnerShare,
  Pnl,
  Summary,
  TractorReport,
} from "../src/modules/reports/reports.schema.ts";
import { useTestApp } from "./app.ts";
import {
  BUSINESS_START,
  makeCustomer,
  makeDriver,
  makeKhet,
  makeLabourer,
  makePartner,
  makeSettings,
  makeTractor,
} from "./factories.ts";
import { assertLedgerInvariants } from "./invariants.ts";

const t = useTestApp();

/** Small seeded generator so the "random" business is the same on every run. */
function generator(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error("pick from an empty list");
      return item;
    },
    chance: (probability: number) => next() < probability,
  };
}

const iso = (value: string): IsoDate => isoDateSchema.parse(value);
const START = iso(BUSINESS_START);
const FIRST_DAY = iso("2026-08-29");
const TODAY = iso("2026-10-28");

interface Tally {
  requests: number;
  accepted: number;
}

async function send(tally: Tally, request: Promise<TestResponse>): Promise<TestResponse> {
  const response = await request;
  tally.requests += 1;
  expect(response.statusCode, response.body).toBeLessThan(500);
  if (response.statusCode < 300) tally.accepted += 1;
  return response;
}

/** Sixty days of trips, payments, expenses, salary, EMI and partner money through the API. */
async function seedSixtyDays(seed: number): Promise<Tally> {
  const random = generator(seed);
  const tally: Tally = { requests: 0, accepted: 0 };
  await makeSettings(t, { openingCash: 25000, openingOnline: 40000 });
  const tractors = [await makeTractor(t), await makeTractor(t)];
  const drivers = [
    await makeDriver(t, { defaultTractorId: tractors[0]?.id, joinedOn: BUSINESS_START }),
    await makeDriver(t, { defaultTractorId: tractors[1]?.id, joinedOn: "2026-08-10" }),
  ];
  const customers = [await makeCustomer(t), await makeCustomer(t), await makeCustomer(t)];
  const khets = [await makeKhet(t), await makeKhet(t)];
  const labourer = await makeLabourer(t);
  const partner = await makePartner(t, { sharePercent: 40 });
  const loan = await send(
    tally,
    t.post(`/tractors/${String(tractors[0]?.id)}/loans`, {
      lender: "Finance Co",
      emiAmount: 20000,
      emiDay: 5,
      firstEmiMonth: "2026-09",
      totalInstallments: 12,
    }),
  );
  const loanId = loan.json<{ id: number }>().id;
  await send(
    tally,
    t.post(`/customers/${String(customers[0]?.id)}/opening-balance`, { amount: 7000 }),
  );

  for (let offset = 0; offset < 60; offset += 1) {
    const day = addDays(FIRST_DAY, offset);
    const driverIndex = random.int(0, 1);
    const driver = drivers[driverIndex];
    const tractor = tractors[driverIndex];
    for (let trip = random.int(0, 4); trip > 0; trip -= 1) {
      const amount = random.int(8, 60) * 100;
      const type = random.pick(["DUE", "CASH", "ONLINE", "PARTIAL"] as const);
      await send(
        tally,
        t.post("/trips", {
          tripDate: day,
          customerId: random.pick(customers).id,
          driverId: driver?.id,
          tractorId: tractor?.id,
          khetId: random.pick(khets).id,
          amount,
          payment:
            type === "PARTIAL"
              ? { type, paidAmount: Math.floor(amount / 3), mode: random.pick(["CASH", "ONLINE"]) }
              : { type },
        }),
      );
    }
    if (random.chance(0.6)) {
      await send(
        tally,
        t.post(`/customers/${String(random.pick(customers).id)}/payments`, {
          kind: "PAYMENT",
          paidOn: day,
          amount: random.int(5, 80) * 100,
          mode: random.pick(["CASH", "ONLINE"]),
        }),
      );
    }
    if (random.chance(0.1)) {
      await send(
        tally,
        t.post(`/customers/${String(random.pick(customers).id)}/payments`, {
          kind: "WRITE_OFF",
          paidOn: day,
          amount: random.int(1, 5) * 100,
        }),
      );
    }
    for (let expense = random.int(0, 2); expense > 0; expense -= 1) {
      const base = {
        spentOn: day,
        amount: random.int(2, 40) * 100,
        mode: random.pick(["CASH", "ONLINE"]),
      };
      const category = random.pick([
        "LABOUR",
        "DIESEL",
        "POLICE",
        "OTHER",
        "ROYALTY",
        "EMERGENCY",
        "TRACTOR_SERVICE",
      ]);
      const details: Record<string, Record<string, unknown>> = {
        LABOUR: { labourerId: labourer.id },
        DIESEL: {
          tractorId: tractor?.id,
          driverId: driver?.id,
          litres: random.int(10, 60),
          amount: random.int(10, 60) * 95,
        },
        POLICE: { notes: "checkpost" },
        OTHER: { notes: "misc" },
        ROYALTY: {},
        EMERGENCY: { notes: "breakdown", tractorId: tractor?.id },
        TRACTOR_SERVICE: { notes: "service", tractorId: tractor?.id },
      };
      await send(tally, t.post("/expenses", { ...base, category, ...details[category] }));
    }
    if (random.chance(0.3)) {
      await send(
        tally,
        t.post(`/drivers/${String(random.pick(drivers).id)}/payments`, {
          type: "ADVANCE",
          paidOn: day,
          amount: random.int(5, 30) * 100,
          mode: "CASH",
        }),
      );
    }
    if (random.chance(0.15)) {
      await send(
        tally,
        t.post(`/partners/${String(partner.id)}/txns`, {
          direction: random.pick(["PAID_TO_PARTNER", "RECEIVED_FROM_PARTNER"]),
          txnDate: day,
          amount: random.int(10, 100) * 100,
          mode: random.pick(["CASH", "ONLINE"]),
        }),
      );
    }
    if (random.chance(0.1)) {
      const payments = await t.db.customerPayment.findMany({ where: { deletedAt: null } });
      if (payments.length > 0) {
        await send(tally, t.delete(`/payments/${String(random.pick(payments).id)}`));
      }
    }
    if (random.chance(0.08)) {
      const trips = await t.db.trip.findMany({ where: { deletedAt: null, kind: "TRIP" } });
      if (trips.length > 0) {
        const release = String(random.chance(0.5));
        await send(
          tally,
          t.delete(`/trips/${String(random.pick(trips).id)}?releasePayments=${release}`),
        );
      }
    }
  }

  // Entries on the very first and last day of the full range catch an off-by-one in date filters.
  for (const day of [START, TODAY]) {
    await send(
      tally,
      t.post("/trips", {
        tripDate: day,
        customerId: customers[1]?.id,
        driverId: drivers[0]?.id,
        tractorId: tractors[0]?.id,
        khetId: khets[0]?.id,
        amount: 1234,
        payment: { type: "CASH" },
      }),
    );
  }
  await send(
    tally,
    t.post("/expenses", {
      category: "OTHER",
      spentOn: TODAY,
      amount: 321,
      mode: "CASH",
      notes: "last day",
    }),
  );
  for (const driver of drivers) {
    await send(tally, t.post(`/drivers/${String(driver.id)}/close-month`, { month: "2026-09" }));
  }
  const emi = { mode: "ONLINE", amount: 20000 };
  await send(
    tally,
    t.post(`/loans/${String(loanId)}/emi`, { ...emi, emiMonth: "2026-09", paidOn: "2026-09-05" }),
  );
  await send(
    tally,
    t.post(`/loans/${String(loanId)}/emi`, {
      ...emi,
      emiMonth: "2026-10",
      paidOn: "2026-10-06",
      lateFee: 300,
    }),
  );
  return tally;
}

const sum = <Row>(rows: readonly Row[], value: (row: Row) => number): number =>
  rows.reduce((total, row) => total + value(row), 0);

/** Sums straight from the tables, written without the services, to check them against. */
async function independentTotals(range: ClosedRange) {
  const within = (date: Date) => {
    const day = date.toISOString().slice(0, 10);
    return day >= range.from && day <= range.to;
  };
  const [trips, payments, expenses, accruals, driverPayments, partnerTxns, settings, partners] =
    await Promise.all([
      t.db.trip.findMany({ where: { deletedAt: null } }),
      t.db.customerPayment.findMany({
        where: { deletedAt: null },
        include: { deliveryTrip: true },
      }),
      t.db.expense.findMany({ where: { deletedAt: null } }),
      t.db.driverAccrual.findMany({ where: { deletedAt: null } }),
      t.db.driverPayment.findMany({ where: { deletedAt: null } }),
      t.db.partnerTxn.findMany({ where: { deletedAt: null } }),
      t.db.setting.findUniqueOrThrow({ where: { id: 1 } }),
      t.db.partner.findMany(),
    ]);
  const realTrips = trips.filter((row) => row.kind === "TRIP" && within(row.tripDate));
  const inRange = {
    payments: payments.filter((row) => within(row.paidOn)),
    expenses: expenses.filter((row) => within(row.spentOn)),
    accruals: accruals.filter((row) => within(row.accruedOn) && row.kind !== "OPENING_BALANCE"),
    driverPayments: driverPayments.filter((row) => within(row.paidOn)),
    partnerTxns: partnerTxns.filter((row) => within(row.txnDate)),
  };
  const moneyIn = inRange.payments.filter((row) => row.kind === "PAYMENT");
  const signedPartner = (row: (typeof partnerTxns)[number]) =>
    row.direction === "PAID_TO_PARTNER" ? row.amountPaise : -row.amountPaise;
  const cashMovement = (mode: "CASH" | "ONLINE") =>
    sum(
      moneyIn.filter((row) => row.mode === mode),
      (row) => row.amountPaise,
    ) -
    sum(
      inRange.partnerTxns.filter((row) => row.mode === mode),
      signedPartner,
    ) -
    sum(
      inRange.expenses.filter((row) => row.mode === mode),
      (row) => row.amountPaise,
    ) -
    sum(
      inRange.driverPayments.filter((row) => row.mode === mode),
      (row) => row.amountPaise,
    );

  const tripRevenue = sum(realTrips, (row) => row.amountPaise);
  const writeOffs = sum(
    inRange.payments.filter((row) => row.kind === "WRITE_OFF"),
    (row) => row.amountPaise,
  );
  const expenseTotal = sum(inRange.expenses, (row) => row.amountPaise);
  const salaryEarned = sum(inRange.accruals, (row) => row.amountPaise);
  const profit = tripRevenue - writeOffs - expenseTotal - salaryEarned;
  const sharer = partners.find((partner) => partner.shareBasisPoints !== null);
  if (!sharer?.shareBasisPoints) throw new Error("the seeded partner has a share percent");
  return {
    billed: sum(trips, (row) => row.amountPaise),
    paidOrForgiven: sum(payments, (row) => row.amountPaise),
    tripRevenue,
    tripCount: realTrips.length,
    writeOffs,
    expenses: expenseTotal,
    diesel: sum(
      inRange.expenses.filter((row) => row.category === "DIESEL"),
      (row) => row.amountPaise,
    ),
    tractorCosts: sum(
      inRange.expenses.filter((row) => row.tractorId !== null),
      (row) => row.amountPaise,
    ),
    salaryEarned,
    advances: sum(
      inRange.driverPayments.filter((row) => row.type === "ADVANCE"),
      (row) => row.amountPaise,
    ),
    driverPaid: sum(inRange.driverPayments, (row) => row.amountPaise),
    cashIn: sum(
      moneyIn.filter((row) => row.mode === "CASH"),
      (row) => row.amountPaise,
    ),
    onlineIn: sum(
      moneyIn.filter((row) => row.mode === "ONLINE"),
      (row) => row.amountPaise,
    ),
    newDues:
      tripRevenue -
      sum(
        moneyIn.filter((row) => row.deliveryTrip !== null && row.deliveryTrip.deletedAt === null),
        (row) => row.amountPaise,
      ),
    duesRecovered: sum(
      moneyIn.filter((row) => row.deliveryTripId === null),
      (row) => row.amountPaise,
    ),
    partnerNetPaid: sum(inRange.partnerTxns, signedPartner),
    profit,
    share: { partnerId: sharer.id, due: Math.round((profit * sharer.shareBasisPoints) / 10_000) },
    cashClosing: settings.openingCashPaise + cashMovement("CASH"),
    onlineClosing: settings.openingOnlinePaise + cashMovement("ONLINE"),
  };
}

describe("reconciliation over sixty days of random business", () => {
  it("agrees with sums taken straight from the tables, in every report", async () => {
    const tally = await seedSixtyDays(20261028);
    expect(tally.accepted / tally.requests, "most actions should be accepted").toBeGreaterThan(
      0.85,
    );
    await assertLedgerInvariants(t.db);
    const expected = await independentTotals({ from: START, to: TODAY });
    const range = `from=${START}&to=${TODAY}`;

    // Every customer's balance adds up to what was billed less what was paid or forgiven.
    const balances = await t.db.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(balance), 0) AS total FROM "CustomerTotals"`;
    expect(Number(balances[0]?.total)).toBe(expected.billed - expected.paidOrForgiven);

    // Both books close where the raw money says they should; any day opens on the day before.
    const cashBook = (await t.get(`/reports/cashbook?mode=CASH&${range}`)).json<Cashbook>();
    const onlineBook = (await t.get(`/reports/cashbook?mode=ONLINE&${range}`)).json<Cashbook>();
    expect(cashBook.closingPaise).toBe(expected.cashClosing);
    expect(onlineBook.closingPaise).toBe(expected.onlineClosing);
    for (const cut of ["2026-09-01", "2026-09-17", "2026-10-02", "2026-10-21"]) {
      const dayBefore = addDays(iso(cut), -1);
      const raw = await independentTotals({ from: START, to: dayBefore });
      const after = (
        await t.get(`/reports/cashbook?mode=CASH&from=${cut}&to=${TODAY}`)
      ).json<Cashbook>();
      expect(after.openingPaise, `cash opening on ${cut}`).toBe(raw.cashClosing);
    }

    // Profit, for the whole period and for one month, ends included.
    const pnl = (await t.get(`/reports/pnl?${range}`)).json<Pnl>();
    expect(pnl.revenue).toEqual({
      tripsPaise: expected.tripRevenue,
      writeOffsPaise: expected.writeOffs,
      netPaise: expected.tripRevenue - expected.writeOffs,
    });
    expect(pnl.expenses.totalPaise).toBe(expected.expenses);
    expect(pnl.driverSalaryPaise).toBe(expected.salaryEarned);
    expect(pnl.profitPaise).toBe(expected.profit);
    const september = await independentTotals({ from: iso("2026-09-01"), to: iso("2026-09-30") });
    const pnlSeptember = (await t.get("/reports/pnl?from=2026-09-01&to=2026-09-30")).json<Pnl>();
    expect(pnlSeptember.profitPaise).toBe(september.profit);
    expect(pnlSeptember.driverSalaryPaise).toBe(september.salaryEarned);

    // The breakdowns add up to the whole.
    const tractors = (await t.get(`/reports/tractors?${range}`)).json<TractorReport>();
    const khets = (await t.get(`/reports/khets?${range}`)).json<KhetReport>();
    const drivers = (await t.get(`/reports/drivers?${range}`)).json<DriverReport>();
    expect(sum(tractors.tractors, (row) => row.revenuePaise)).toBe(expected.tripRevenue);
    expect(sum(tractors.tractors, (row) => row.dieselPaise)).toBe(expected.diesel);
    expect(sum(tractors.tractors, (row) => row.contributionPaise)).toBe(
      expected.tripRevenue - expected.tractorCosts,
    );
    expect(sum(khets.khets, (row) => row.revenuePaise)).toBe(expected.tripRevenue);
    expect(sum(drivers.drivers, (row) => row.trips)).toBe(expected.tripCount);
    expect(sum(drivers.drivers, (row) => row.salaryEarnedPaise)).toBe(expected.salaryEarned);
    expect(sum(drivers.drivers, (row) => row.advancesPaise)).toBe(expected.advances);

    // The day-by-day summary matches the raw figures for the period.
    const summary = (await t.get(`/reports/summary?${range}`)).json<Summary>();
    expect(summary.totals).toEqual({
      trips: expected.tripCount,
      revenuePaise: expected.tripRevenue,
      cashInPaise: expected.cashIn,
      onlineInPaise: expected.onlineIn,
      newDuesPaise: expected.newDues,
      duesRecoveredPaise: expected.duesRecovered,
      expensesPaise: expected.expenses,
      driverPaymentsPaise: expected.driverPaid,
      partnerNetPaidPaise: expected.partnerNetPaid,
    });

    // The partner's share is their percent of that profit, less what they were paid.
    const share = (
      await t.get(`/partners/${String(expected.share.partnerId)}/share?${range}`)
    ).json<PartnerShare>();
    expect(share).toMatchObject({
      profitPaise: expected.profit,
      shareDuePaise: expected.share.due,
      netPaidPaise: expected.partnerNetPaid,
      balancePaise: expected.share.due - expected.partnerNetPaid,
    });

    // The dashboard's money matches the books.
    const board = (await t.get("/dashboard")).json<Dashboard>();
    expect(board.cashInHandPaise).toBe(expected.cashClosing);
    expect(board.onlineBalancePaise).toBe(expected.onlineClosing);
    expect(board.totalDuesPaise).toBe(
      Number(
        (
          await t.db.$queryRaw<{ total: bigint }[]>`
            SELECT COALESCE(SUM(balance), 0) AS total FROM "CustomerTotals" WHERE balance > 0`
        )[0]?.total,
      ),
    );

    // Every entry ever made, kept or deleted, has its creation in the audit log.
    const entries = {
      Trip: await t.db.trip.findMany({ select: { id: true } }),
      CustomerPayment: await t.db.customerPayment.findMany({ select: { id: true } }),
      Expense: await t.db.expense.findMany({ select: { id: true } }),
      DriverPayment: await t.db.driverPayment.findMany({ select: { id: true } }),
      PartnerTxn: await t.db.partnerTxn.findMany({ select: { id: true } }),
    };
    for (const [entity, rows] of Object.entries(entries)) {
      const audited = await t.db.auditLog.findMany({
        where: { entity, action: "CREATE" },
        select: { entityId: true },
      });
      const auditedIds = new Set(audited.map((row) => row.entityId));
      const missing = rows.filter((row) => !auditedIds.has(String(row.id)));
      expect(missing, `${entity} rows without a CREATE audit`).toEqual([]);
    }
  }, 180_000);
});
