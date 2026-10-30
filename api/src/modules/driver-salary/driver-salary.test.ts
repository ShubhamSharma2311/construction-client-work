import { beforeEach, describe, expect, it } from "vitest";
import { errorOf, useTestApp } from "../../../test/app.ts";
import { makeDriver, makeSettings } from "../../../test/factories.ts";
import type { DriverDto, DriverUpdated } from "../drivers/drivers.schema.ts";
import type {
  AccrualSaved,
  DriverLedger,
  DriverPaymentPage,
  DriverPaymentSaved,
  SalaryPreview,
} from "./driver-salary.schema.ts";

const t = useTestApp();
let driver: DriverDto;

beforeEach(async () => {
  await makeSettings(t);
  driver = await makeDriver(t, { name: "Bhagirath", joinedOn: "2026-04-16", monthlySalary: 15000 });
});

const url = (suffix: string) => `/drivers/${String(driver.id)}${suffix}`;

function close(month: string, extra: Record<string, unknown> = {}) {
  return t.post(url("/close-month"), { month, ...extra });
}

async function closed(month: string, extra: Record<string, unknown> = {}): Promise<AccrualSaved> {
  const response = await close(month, extra);
  expect(response.statusCode, response.body).toBe(201);
  return response.json<AccrualSaved>();
}

function pay(body: Record<string, unknown>, key?: string) {
  return t.post(
    url("/payments"),
    { type: "ADVANCE", paidOn: "2026-09-10", amount: 5000, mode: "CASH", ...body },
    key,
  );
}

async function paid(body: Record<string, unknown>): Promise<DriverPaymentSaved> {
  const response = await pay(body);
  expect(response.statusCode, response.body).toBe(201);
  return response.json<DriverPaymentSaved>();
}

describe("salary preview", () => {
  it("prorates the joining month and pays a full month in full", async () => {
    const april = (await t.get(url("/salary?month=2026-04"))).json<SalaryPreview>();
    const september = (await t.get(url("/salary?month=2026-09"))).json<SalaryPreview>();

    expect(april).toEqual({
      month: "2026-04",
      monthlyPaise: 1_500_000,
      daysInMonth: 30,
      daysWorked: 15,
      suggestedPaise: 750_000,
      closed: null,
    });
    expect(september.suggestedPaise).toBe(1_500_000);
  });
});

describe("closing a month", () => {
  it("records the prorated salary and shows it in the balance", async () => {
    const saved = await closed("2026-04");

    expect(saved.accrual).toMatchObject({
      kind: "MONTH_SALARY",
      month: "2026-04",
      accruedOn: "2026-04-30",
      amountPaise: 750_000,
    });
    expect(saved.balancePaise).toBe(750_000);
    expect((await t.get(url("/salary?month=2026-04"))).json<SalaryPreview>().closed?.id).toBe(
      saved.accrual.id,
    );
  });

  it.each([
    ["the current month", "2026-10", 409],
    ["a future month", "2026-11", 409],
    ["a month before joining", "2026-03", 409],
  ])("refuses %s", async (_label, month, status) => {
    expect((await close(month)).statusCode).toBe(status);
  });

  it("refuses closing a month twice", async () => {
    await closed("2026-05");

    const response = await close("2026-05");

    expect(response.statusCode).toBe(409);
    expect(errorOf(response).message).toContain("already closed");
  });

  it("stops at the leaving month and prorates it", async () => {
    await t.patch(url(""), { leftOn: "2026-08-10" });

    const august = await closed("2026-08");

    expect(august.accrual.amountPaise).toBe(Math.round((1_500_000 * 10) / 31));
    expect((await close("2026-09")).statusCode).toBe(409);
  });

  it("needs a note to record a different amount", async () => {
    expect((await close("2026-06", { amount: 14000 })).statusCode).toBe(400);

    const saved = await closed("2026-06", { amount: 14000, note: "2 days unpaid leave" });

    expect(saved.accrual).toMatchObject({ amountPaise: 1_400_000, note: "2 days unpaid leave" });
  });

  it("refuses months before the business started", async () => {
    await makeSettings(t, { businessStartDate: "2026-06-01" });

    const response = await close("2026-05");

    expect(response.statusCode).toBe(409);
    expect(errorOf(response).message).toContain("opening balance");
  });

  it("reopens a month so it can be closed again", async () => {
    await closed("2026-07");

    const reopened = await t.delete(url("/close-month/2026-07"));

    expect(reopened.json<AccrualSaved>().balancePaise).toBe(0);
    expect((await close("2026-07")).statusCode).toBe(201);
    expect((await t.delete(url("/close-month/2026-08"))).statusCode).toBe(404);
  });

  it("uses each month's own rate when the salary changes", async () => {
    await t.post(url("/salary-rates"), { effectiveFrom: "2026-08", monthlySalary: 16000 });

    expect((await closed("2026-07")).accrual.amountPaise).toBe(1_500_000);
    expect((await closed("2026-08")).accrual.amountPaise).toBe(1_600_000);
  });
});

describe("advances and salary", () => {
  it("deducts advances from the month's salary", async () => {
    await paid({ type: "ADVANCE", amount: 5000, paidOn: "2026-09-05" });
    const afterClose = await closed("2026-09");

    expect(afterClose.balancePaise).toBe(1_000_000);
    const settled = await paid({
      type: "SALARY",
      amount: 10000,
      paidOn: "2026-10-01",
      forMonth: "2026-09",
    });
    expect(settled.balancePaise).toBe(0);
    expect(settled.payment).toMatchObject({ type: "SALARY", forMonth: "2026-09" });
  });

  it("carries advances larger than the salary into the next months", async () => {
    await paid({ amount: 20000, paidOn: "2026-07-05" });
    expect((await closed("2026-07")).balancePaise).toBe(-500_000);
    expect((await closed("2026-08")).balancePaise).toBe(1_000_000);
    expect((await paid({ type: "SALARY", amount: 10000, paidOn: "2026-09-01" })).balancePaise).toBe(
      0,
    );
  });

  it("records one payment for a replayed request", async () => {
    await pay({}, "driver-pay-0001");
    const replay = await pay({}, "driver-pay-0001");

    expect(replay.headers["idempotent-replay"]).toBe("true");
    expect(await t.db.driverPayment.count()).toBe(1);
  });

  it.each([
    ["a future date", { paidOn: "2026-10-29" }],
    ["a zero amount", { amount: 0 }],
    ["a bonus through this route", { type: "BONUS" }],
    ["no mode", { mode: undefined }],
  ])("refuses %s", async (_label, body) => {
    expect((await pay(body)).statusCode).toBe(400);
  });

  it("pays a driver who has left, and 404s an unknown one", async () => {
    await t.patch(url(""), { isActive: false });

    expect((await pay({})).statusCode).toBe(201);
    expect(
      (
        await t.post("/drivers/99999/payments", {
          type: "ADVANCE",
          paidOn: "2026-09-10",
          amount: 1,
          mode: "CASH",
        })
      ).statusCode,
    ).toBe(404);
  });

  it("reverses a payment entered by mistake", async () => {
    const saved = await paid({});

    const reversed = await t.delete(`/driver-payments/${String(saved.payment.id)}`);

    expect(reversed.json<DriverPaymentSaved>().balancePaise).toBe(0);
    expect((await t.delete(`/driver-payments/${String(saved.payment.id)}`)).statusCode).toBe(409);
  });
});

describe("bonus and opening balance", () => {
  it("records a bonus as earned and paid together, and reverses both", async () => {
    const response = await t.post(url("/bonus"), {
      paidOn: "2026-10-20",
      amount: 2000,
      mode: "CASH",
      note: "Diwali",
    });

    const saved = response.json<DriverPaymentSaved>();
    expect(saved.payment.type).toBe("BONUS");
    expect(saved.balancePaise).toBe(0);
    await t.delete(`/driver-payments/${String(saved.payment.id)}`);
    expect(await t.db.driverAccrual.count({ where: { deletedAt: null } })).toBe(0);
  });

  it("needs a note for a bonus", async () => {
    expect(
      (await t.post(url("/bonus"), { paidOn: "2026-10-20", amount: 2000, mode: "CASH" }))
        .statusCode,
    ).toBe(400);
  });

  it("carries an advance the driver held in the old register, once", async () => {
    const response = await t.post(url("/opening-balance"), {
      amount: -3000,
      note: "advance in register",
    });

    expect(response.json<AccrualSaved>()).toMatchObject({
      accrual: { kind: "OPENING_BALANCE", accruedOn: "2026-04-01", amountPaise: -300_000 },
      balancePaise: -300_000,
    });
    expect((await t.post(url("/opening-balance"), { amount: 100 })).statusCode).toBe(409);
    expect((await t.post(url("/opening-balance"), { amount: 0 })).statusCode).toBe(400);
  });

  it("moves the driver's opening balance with the business start", async () => {
    await t.post(url("/opening-balance"), { amount: 1000 });

    await makeSettings(t, { businessStartDate: "2026-03-01" });

    const opening = await t.db.driverAccrual.findFirstOrThrow({
      where: { kind: "OPENING_BALANCE" },
    });
    expect(opening.accruedOn).toEqual(new Date("2026-03-01T00:00:00Z"));
  });
});

describe("driver ledger", () => {
  it("shows earnings and payments with a running balance and monthly totals", async () => {
    await t.post(url("/opening-balance"), { amount: 1000 });
    await paid({ amount: 5000, paidOn: "2026-08-05" });
    await closed("2026-08");
    await paid({ type: "SALARY", amount: 11000, paidOn: "2026-09-02" });

    const ledger = (await t.get(url("/ledger"))).json<DriverLedger>();

    expect(
      ledger.entries.map((entry) => [
        entry.date,
        entry.type,
        entry.earnedPaise,
        entry.paidPaise,
        entry.balancePaise,
      ]),
    ).toEqual([
      ["2026-04-01", "OPENING_BALANCE", 100_000, 0, 100_000],
      ["2026-08-05", "PAID_ADVANCE", 0, 500_000, -400_000],
      ["2026-08-31", "EARNED_SALARY", 1_500_000, 0, 1_100_000],
      ["2026-09-02", "PAID_SALARY", 0, 1_100_000, 0],
    ]);
    expect(ledger.months).toEqual([
      { month: "2026-04", earnedPaise: 100_000, paidPaise: 0, closingBalancePaise: 100_000 },
      {
        month: "2026-08",
        earnedPaise: 1_500_000,
        paidPaise: 500_000,
        closingBalancePaise: 1_100_000,
      },
      { month: "2026-09", earnedPaise: 0, paidPaise: 1_100_000, closingBalancePaise: 0 },
    ]);
    expect(ledger.closingBalancePaise).toBe(0);
  });

  it("gives each line's month, note and mode apart, so screens can word them", async () => {
    await paid({ amount: 5000, paidOn: "2026-08-05", mode: "ONLINE", notes: "tyre" });
    await closed("2026-08");
    await paid({ type: "SALARY", amount: 11000, paidOn: "2026-09-02", forMonth: "2026-08" });

    const ledger = (await t.get(url("/ledger"))).json<DriverLedger>();

    expect(ledger.entries.map(({ type, month, note, mode }) => ({ type, month, note, mode }))).toEqual([
      { type: "PAID_ADVANCE", month: null, note: "tyre", mode: "ONLINE" },
      { type: "EARNED_SALARY", month: "2026-08", note: null, mode: null },
      { type: "PAID_SALARY", month: "2026-08", note: null, mode: "CASH" },
    ]);
  });

  it("opens a date range with the balance carried into it", async () => {
    await paid({ amount: 5000, paidOn: "2026-08-05" });
    await closed("2026-08");

    const ledger = (await t.get(url("/ledger?from=2026-09-01"))).json<DriverLedger>();

    expect(ledger).toMatchObject({
      openingBalancePaise: 1_000_000,
      entries: [],
      closingBalancePaise: 1_000_000,
    });
    expect((await t.get("/drivers/99999/ledger")).statusCode).toBe(404);
  });
});

describe("driver payment list", () => {
  it("totals advances, salary and bonus, and exports CSV", async () => {
    await paid({ amount: 5000 });
    await paid({ type: "SALARY", amount: 10000, mode: "ONLINE" });
    await t.post(url("/bonus"), { paidOn: "2026-09-10", amount: 1000, mode: "CASH", note: "x" });

    const page = (
      await t.get(`/driver-payments?driverId=${String(driver.id)}`)
    ).json<DriverPaymentPage>();
    const csv = await t.get("/driver-payments/export?from=2026-09-01&to=2026-09-30");

    expect(page.totals).toEqual({
      advancePaise: 500_000,
      salaryPaise: 1_000_000,
      bonusPaise: 100_000,
    });
    expect((await t.get("/driver-payments?type=SALARY")).json<DriverPaymentPage>().total).toBe(1);
    expect(csv.headers["content-disposition"]).toContain(
      "driver_payments_2026-09-01_to_2026-09-30.csv",
    );
    expect(csv.body.split("\r\n").filter((line) => line.includes("Bhagirath"))).toHaveLength(3);
  });
});

describe("rules that touch the driver's record", () => {
  it("warns how much is owed when a driver with a balance is made inactive", async () => {
    await closed("2026-09");

    const response = await t.patch(url(""), { isActive: false });

    expect(response.json<DriverUpdated>().warnings).toContain("Bhagirath is still owed ₹15,000.00");
  });

  it("warns about an advance the driver still holds", async () => {
    await paid({ amount: 2000 });

    const response = await t.patch(url(""), { isActive: false });

    expect(response.json<DriverUpdated>().warnings).toContain(
      "Bhagirath still holds ₹2,000.00 of advance",
    );
  });

  it("refuses dates that would leave a closed month outside the driver's time", async () => {
    await closed("2026-06");

    expect((await t.patch(url(""), { leftOn: "2026-05-31" })).statusCode).toBe(409);
    expect((await t.patch(url(""), { joinedOn: "2026-07-01" })).statusCode).toBe(409);
    expect((await t.patch(url(""), { leftOn: "2026-06-30" })).statusCode).toBe(200);
  });

  it("refuses a salary rate change over months already closed", async () => {
    await closed("2026-08");
    const later = (
      await t.post(url("/salary-rates"), { effectiveFrom: "2026-09", monthlySalary: 16000 })
    ).json<DriverDto>();

    expect(
      (await t.post(url("/salary-rates"), { effectiveFrom: "2026-08", monthlySalary: 17000 }))
        .statusCode,
    ).toBe(409);
    expect(
      (await t.post(url("/salary-rates"), { effectiveFrom: "2026-07", monthlySalary: 17000 }))
        .statusCode,
    ).toBe(409);
    const septemberRate = later.salaryRates.find((rate) => rate.effectiveFrom === "2026-09");
    expect((await t.delete(url(`/salary-rates/${String(septemberRate?.id)}`))).statusCode).toBe(
      200,
    );
  });

  it("refuses deleting the rate a closed month used", async () => {
    const withRate = (
      await t.post(url("/salary-rates"), { effectiveFrom: "2026-08", monthlySalary: 16000 })
    ).json<DriverDto>();
    await closed("2026-08");
    const augustRate = withRate.salaryRates.find((rate) => rate.effectiveFrom === "2026-08");

    expect((await t.delete(url(`/salary-rates/${String(augustRate?.id)}`))).statusCode).toBe(409);
  });

  it("stops the business start moving past a driver payment", async () => {
    await paid({ paidOn: "2026-05-01" });

    expect((await makeSettingsResponse("2026-06-01")).statusCode).toBe(409);
  });
});

function makeSettingsResponse(businessStartDate: string) {
  return t.put("/settings", {
    businessName: "Godara Bajri",
    businessStartDate,
    openingCash: 0,
    openingOnline: 0,
  });
}

describe("review fixes", () => {
  it("refuses a leaving date inside a month already closed in full", async () => {
    await closed("2026-09");

    const response = await t.patch(url(""), { leftOn: "2026-09-20" });

    expect(response.statusCode).toBe(409);
    expect(errorOf(response).message).toContain("2026-09");
  });

  it("refuses moving the joining date within a closed joining month", async () => {
    await closed("2026-04");

    expect((await t.patch(url(""), { joinedOn: "2026-04-20" })).statusCode).toBe(409);
  });

  it("refuses clearing a leaving date when the leaving month is closed", async () => {
    await t.patch(url(""), { leftOn: "2026-08-10" });
    await closed("2026-08");

    expect((await t.patch(url(""), { leftOn: null })).statusCode).toBe(409);
  });

  it("allows date changes that leave every closed month untouched", async () => {
    await closed("2026-06");

    expect((await t.patch(url(""), { leftOn: "2026-08-15" })).statusCode).toBe(200);
    expect((await t.patch(url(""), { leftOn: "2026-08-20" })).statusCode).toBe(200);
  });

  it("removes a wrong opening balance so it can be entered again", async () => {
    await t.post(url("/opening-balance"), { amount: 5000 });

    const removed = await t.delete(url("/opening-balance"));

    expect(removed.json<AccrualSaved>().balancePaise).toBe(0);
    const again = await t.post(url("/opening-balance"), { amount: -5000 });
    expect(again.json<AccrualSaved>().balancePaise).toBe(-500_000);
    expect((await t.delete(`/drivers/99999/opening-balance`)).statusCode).toBe(404);
  });

  it("allows a rate before the next rate when only later-rate months are closed", async () => {
    await t.post(url("/salary-rates"), { effectiveFrom: "2026-06", monthlySalary: 16000 });
    await closed("2026-07");

    const response = await t.post(url("/salary-rates"), {
      effectiveFrom: "2026-05",
      monthlySalary: 15500,
    });

    expect(response.statusCode).toBe(201);
  });

  it("audits the earning removed with a reversed bonus", async () => {
    const saved = (
      await t.post(url("/bonus"), { paidOn: "2026-10-20", amount: 2000, mode: "CASH", note: "x" })
    ).json<DriverPaymentSaved>();

    await t.delete(`/driver-payments/${String(saved.payment.id)}`);

    const audit = await t.db.auditLog.findFirstOrThrow({
      where: { entity: "DriverAccrual", action: "DELETE" },
    });
    expect(audit.before).toMatchObject({ kind: "BONUS", amountPaise: 200_000 });
  });
});
