import type { TestResponse } from "../../../test/response.ts";
import { beforeEach, describe, expect, it } from "vitest";
import { errorOf, useTestApp } from "../../../test/app.ts";
import {
  makeCustomer,
  makeLabourer,
  makePartner,
  makePayment,
  makeSettings,
  makeTrip,
  makeTripMasters,
  type TripMasters,
} from "../../../test/factories.ts";
import type { CustomerDto } from "../customers/customers.schema.ts";
import type { PartnerDto } from "../partners/partners.schema.ts";
import type {
  Cashbook,
  Dashboard,
  DriverReport,
  KhetReport,
  PartnerShare,
  Pnl,
  Summary,
  TractorReport,
} from "./reports.schema.ts";

const t = useTestApp();

/** Scenario setup must not fail quietly; every request has to be accepted. */
async function created(response: Promise<TestResponse>): Promise<void> {
  const result = await response;
  expect(result.statusCode, result.body).toBeLessThan(300);
}
let m: TripMasters;
let other: CustomerDto;
let manish: PartnerDto;

/**
 * A worked scenario whose numbers are checked by hand:
 * - opening cash 10,000, online 5,000
 * - 20 Oct: trips 5,000 cash (customer 1), 3,000 due (customer 1), 4,000 with 1,000 online (customer 2)
 * - 21 Oct: customer 1 pays 2,000 cash and 500 is written off; diesel 900 cash, labour 700 cash,
 *   royalty 2,500 online; driver advance 1,000 cash; 3,000 online to Manish
 * - 22 Oct: Manish puts back 500 cash
 * - September salary 15,000 closed (dated 30 Sep)
 */
beforeEach(async () => {
  m = await makeTripMasters(t);
  await makeSettings(t, { openingCash: 10000, openingOnline: 5000 });
  other = await makeCustomer(t, { name: "Second customer" });
  manish = await makePartner(t, { name: "Manish", sharePercent: 50 });
  const labourer = await makeLabourer(t);

  await makeTrip(t, m, { tripDate: "2026-10-20", amount: 5000, payment: { type: "CASH" } });
  await makeTrip(t, m, { tripDate: "2026-10-20", amount: 3000 });
  await makeTrip(
    t,
    { ...m, customer: other },
    {
      tripDate: "2026-10-20",
      amount: 4000,
      payment: { type: "PARTIAL", paidAmount: 1000, mode: "ONLINE" },
    },
  );
  await makePayment(t, m.customer.id, { paidOn: "2026-10-21", amount: 2000, mode: "CASH" });
  await created(
    t.post(`/customers/${String(m.customer.id)}/payments`, {
      kind: "WRITE_OFF",
      paidOn: "2026-10-21",
      amount: 500,
    }),
  );
  const day21 = { spentOn: "2026-10-21", mode: "CASH" };
  await created(
    t.post("/expenses", {
      ...day21,
      category: "DIESEL",
      amount: 900,
      litres: 10,
      tractorId: m.tractor.id,
      driverId: m.driver.id,
    }),
  );
  await created(
    t.post("/expenses", { ...day21, category: "LABOUR", amount: 700, labourerId: labourer.id }),
  );
  await created(
    t.post("/expenses", { ...day21, category: "ROYALTY", amount: 2500, mode: "ONLINE" }),
  );
  await created(
    t.post(`/drivers/${String(m.driver.id)}/payments`, {
      type: "ADVANCE",
      paidOn: "2026-10-21",
      amount: 1000,
      mode: "CASH",
    }),
  );
  await created(t.post(`/drivers/${String(m.driver.id)}/close-month`, { month: "2026-09" }));
  const partnerUrl = `/partners/${String(manish.id)}/txns`;
  await created(
    t.post(partnerUrl, {
      direction: "PAID_TO_PARTNER",
      txnDate: "2026-10-21",
      amount: 3000,
      mode: "ONLINE",
    }),
  );
  await created(
    t.post(partnerUrl, {
      direction: "RECEIVED_FROM_PARTNER",
      txnDate: "2026-10-22",
      amount: 500,
      mode: "CASH",
    }),
  );
});

const october = "from=2026-10-01&to=2026-10-31";

describe("profit and loss", () => {
  it("is revenue less write-offs, expenses and driver salary; partner money is not a cost", async () => {
    const pnl = (await t.get(`/reports/pnl?${october}`)).json<Pnl>();

    expect(pnl.revenue).toEqual({
      tripsPaise: 1_200_000,
      writeOffsPaise: 50_000,
      netPaise: 1_150_000,
    });
    expect(pnl.expenses.totalPaise).toBe(410_000);
    expect(pnl.expenses.byCategory).toMatchObject({
      DIESEL: 90_000,
      LABOUR: 70_000,
      ROYALTY: 250_000,
    });
    expect(pnl.driverSalaryPaise).toBe(0);
    expect(pnl.profitPaise).toBe(740_000);
  });

  it("counts driver salary in the month it was earned", async () => {
    const pnl = (await t.get("/reports/pnl?from=2026-09-01&to=2026-10-31")).json<Pnl>();

    expect(pnl.driverSalaryPaise).toBe(1_500_000);
    expect(pnl.profitPaise).toBe(-760_000);
  });

  it("is all zeros for a quiet period", async () => {
    const pnl = (await t.get("/reports/pnl?from=2026-05-01&to=2026-05-31")).json<Pnl>();

    expect(pnl.profitPaise).toBe(0);
    expect(pnl.revenue.tripsPaise).toBe(0);
  });
});

describe("cash book", () => {
  it("runs the cash from the opening balance through every line", async () => {
    const book = (await t.get(`/reports/cashbook?mode=CASH&${october}`)).json<Cashbook>();

    expect(book.openingPaise).toBe(1_000_000);
    expect(
      book.lines.map((line) => [
        line.date,
        line.kind,
        line.inPaise,
        line.outPaise,
        line.balancePaise,
      ]),
    ).toEqual([
      ["2026-10-20", "CUSTOMER_PAYMENT", 500_000, 0, 1_500_000],
      ["2026-10-21", "CUSTOMER_PAYMENT", 200_000, 0, 1_700_000],
      ["2026-10-21", "EXPENSE", 0, 90_000, 1_610_000],
      ["2026-10-21", "EXPENSE", 0, 70_000, 1_540_000],
      ["2026-10-21", "DRIVER_PAYMENT", 0, 100_000, 1_440_000],
      ["2026-10-22", "FROM_PARTNER", 50_000, 0, 1_490_000],
    ]);
    expect(book.totals).toEqual({ inPaise: 750_000, outPaise: 260_000 });
    expect(book.closingPaise).toBe(1_490_000);
  });

  it("words each line the way the owner would, not in code names", async () => {
    const cash = (await t.get(`/reports/cashbook?mode=CASH&${october}`)).json<Cashbook>();
    const online = (await t.get(`/reports/cashbook?mode=ONLINE&${october}`)).json<Cashbook>();
    const { customer, tractor, driver } = m;

    expect(cash.lines.map((line) => line.description)).toEqual([
      `Payment from ${customer.name}`,
      `Payment from ${customer.name}`,
      `Diesel, ${tractor.regNumber}, ${driver.name}`,
      expect.stringMatching(/^Labour, /),
      `Advance to ${driver.name}`,
      "Received from partner Manish",
    ]);
    expect(online.lines.map((line) => line.description)).toEqual([
      `Payment from ${other.name}`,
      "Royalty",
      "Paid to partner Manish",
    ]);
  });

  it("keeps the online book separately, write-offs moving no money", async () => {
    const book = (await t.get(`/reports/cashbook?mode=ONLINE&${october}`)).json<Cashbook>();

    expect(book.openingPaise).toBe(500_000);
    expect(book.lines.map((line) => line.kind)).toEqual([
      "CUSTOMER_PAYMENT",
      "EXPENSE",
      "TO_PARTNER",
    ]);
    expect(book.closingPaise).toBe(50_000);
  });

  it("opens each day with the previous day's closing", async () => {
    const day20 = (
      await t.get("/reports/cashbook?mode=CASH&from=2026-10-20&to=2026-10-20")
    ).json<Cashbook>();
    const day21 = (
      await t.get("/reports/cashbook?mode=CASH&from=2026-10-21&to=2026-10-21")
    ).json<Cashbook>();

    expect(day21.openingPaise).toBe(day20.closingPaise);
  });
});

describe("daily summary and dashboard", () => {
  it("summarises each day and the period", async () => {
    const summary = (await t.get("/reports/summary?from=2026-10-20&to=2026-10-22")).json<Summary>();

    expect(summary.days[0]).toMatchObject({
      date: "2026-10-20",
      trips: 3,
      revenuePaise: 1_200_000,
      cashInPaise: 500_000,
      onlineInPaise: 100_000,
      newDuesPaise: 600_000,
      duesRecoveredPaise: 0,
    });
    expect(summary.days[1]).toMatchObject({
      cashInPaise: 200_000,
      duesRecoveredPaise: 200_000,
      expensesPaise: 410_000,
      driverPaymentsPaise: 100_000,
      partnerNetPaidPaise: 300_000,
    });
    expect(summary.days[2]?.partnerNetPaidPaise).toBe(-50_000);
    expect(summary.totals.revenuePaise).toBe(1_200_000);
    expect(summary.totals.expensesPaise).toBe(410_000);
  });

  it("shows the day and where the money stands at its end", async () => {
    const board = (await t.get("/dashboard?date=2026-10-21")).json<Dashboard>();

    expect(board.day).toMatchObject({ trips: 0, cashInPaise: 200_000, expensesPaise: 410_000 });
    expect(board.expensesByCategory).toMatchObject({
      DIESEL: 90_000,
      LABOUR: 70_000,
      ROYALTY: 250_000,
    });
    expect(board.cashInHandPaise).toBe(1_440_000);
    expect(board.onlineBalancePaise).toBe(50_000);
    expect(board.totalDuesPaise).toBe(350_000);
    expect(board.topDues.map((row) => [row.customer.name, row.balancePaise])).toEqual([
      ["Second customer", 300_000],
      [m.customer.name, 50_000],
    ]);
  });

  it("defaults to today", async () => {
    const board = (await t.get("/dashboard")).json<Dashboard>();

    expect(board.date).toBe("2026-10-28");
    expect(board.cashInHandPaise).toBe(1_490_000);
  });
});

describe("breakdowns", () => {
  it("shows each tractor's revenue against its own costs", async () => {
    const report = (await t.get(`/reports/tractors?${october}`)).json<TractorReport>();

    expect(report.tractors).toEqual([
      {
        tractor: { id: m.tractor.id, regNumber: m.tractor.regNumber, label: m.tractor.label },
        trips: 3,
        revenuePaise: 1_200_000,
        dieselPaise: 90_000,
        servicePaise: 0,
        emiPaise: 0,
        otherPaise: 0,
        contributionPaise: 1_110_000,
      },
    ]);
  });

  it("shows trips by khet and the driver's work and pay", async () => {
    const khets = (await t.get(`/reports/khets?${october}`)).json<KhetReport>();
    const drivers = (
      await t.get("/reports/drivers?from=2026-09-01&to=2026-10-31")
    ).json<DriverReport>();

    expect(khets.khets).toEqual([
      { khet: { id: m.khet.id, name: m.khet.name }, trips: 3, revenuePaise: 1_200_000 },
    ]);
    expect(drivers.drivers).toEqual([
      {
        driver: { id: m.driver.id, name: m.driver.name },
        trips: 3,
        revenuePaise: 1_200_000,
        dieselLitres: 10,
        dieselPaise: 90_000,
        salaryEarnedPaise: 1_500_000,
        advancesPaise: 100_000,
        salaryPaidPaise: 0,
      },
    ]);
  });
});

describe("partner share", () => {
  it("compares the partner's share of profit with what was paid to him", async () => {
    const share = (
      await t.get(`/partners/${String(manish.id)}/share?${october}`)
    ).json<PartnerShare>();

    expect(share).toMatchObject({
      partner: { name: "Manish", sharePercent: 50 },
      profitPaise: 740_000,
      shareDuePaise: 370_000,
      netPaidPaise: 250_000,
      balancePaise: 120_000,
    });
  });

  it("needs a share percent", async () => {
    const noShare = await makePartner(t, { name: "Ravi", sharePercent: null });

    const response = await t.get(`/partners/${String(noShare.id)}/share?${october}`);

    expect(response.statusCode).toBe(409);
    expect(errorOf(response).message).toContain("share percent");
  });
});

describe("report ranges and exports", () => {
  it.each([
    ["starting before the business", "/reports/pnl?from=2026-03-01&to=2026-04-30"],
    ["ending before it starts", "/reports/pnl?from=2026-10-10&to=2026-10-01"],
    ["missing an end", "/reports/pnl?from=2026-10-01"],
    ["a day-wise range over a year", "/reports/summary?from=2026-04-01&to=2027-04-02"],
    ["a cash book without a mode", "/reports/cashbook?from=2026-10-01"],
  ])("refuses a report %s", async (_label, url) => {
    expect((await t.get(url)).statusCode).toBe(400);
  });

  it.each([
    [
      "pnl",
      `/reports/pnl/export?${october}`,
      "profit_and_loss_2026-10-01_to_2026-10-31.csv",
      "Profit,7400.00",
    ],
    [
      "cashbook",
      `/reports/cashbook/export?mode=CASH&${october}`,
      "cashbook_cash_2026-10-01_to_2026-10-31.csv",
      "BROUGHT_FORWARD",
    ],
    [
      "summary",
      "/reports/summary/export?from=2026-10-20&to=2026-10-22",
      "daily_summary_2026-10-20_to_2026-10-22.csv",
      "2026-10-21",
    ],
    [
      "tractors",
      `/reports/tractors/export?${october}`,
      "tractors_2026-10-01_to_2026-10-31.csv",
      "11100.00",
    ],
    ["khets", `/reports/khets/export?${october}`, "khets_2026-10-01_to_2026-10-31.csv", "12000.00"],
    [
      "drivers",
      `/reports/drivers/export?${october}`,
      "drivers_2026-10-01_to_2026-10-31.csv",
      "1000.00",
    ],
  ])("exports the %s report as CSV", async (_label, url, fileName, content) => {
    const response = await t.get(url);

    expect(response.headers["content-disposition"]).toContain(fileName);
    expect(response.body).toContain(content);
  });
});

describe("review fixes", () => {
  it("does not count money from a released delivery as a new due or a recovery", async () => {
    const extra = await makeTrip(t, m, {
      tripDate: "2026-10-23",
      amount: 5000,
      payment: { type: "CASH" },
    });
    await created(t.delete(`/trips/${String(extra.trip.id)}?releasePayments=true`));

    const summary = (await t.get("/reports/summary?from=2026-10-23&to=2026-10-23")).json<Summary>();

    expect(summary.days[0]).toMatchObject({
      trips: 0,
      revenuePaise: 0,
      cashInPaise: 500_000,
      newDuesPaise: 0,
      duesRecoveredPaise: 0,
    });
  });

  it("refuses a dashboard for a day that has not come yet", async () => {
    expect((await t.get("/dashboard?date=2026-10-29")).statusCode).toBe(400);
  });

  it("asks for settings before showing a dashboard", async () => {
    await t.db.setting.deleteMany();

    const response = await t.get("/dashboard");

    expect(response.statusCode).toBe(409);
    expect(errorOf(response).message).toContain("business settings");
  });
});
