import { beforeEach, describe, expect, it } from "vitest";
import { errorOf, useTestApp } from "../../../test/app.ts";
import { makeSettings, makeTractor } from "../../../test/factories.ts";
import type { ExpensePage } from "../expenses/expenses.schema.ts";
import type { TractorDto } from "../tractors/tractors.schema.ts";
import type { EmiDue, LoanDetail, LoanDto, LoanPaymentSaved } from "./loans.schema.ts";

const t = useTestApp();
let tractor: TractorDto;

beforeEach(async () => {
  await makeSettings(t);
  tractor = await makeTractor(t, { regNumber: "RJ19AB0001" });
});

const loanBody = {
  lender: "Mahindra Finance",
  emiAmount: 25000,
  emiDay: 10,
  firstEmiMonth: "2026-08",
  totalInstallments: 3,
};

async function makeLoan(overrides: Record<string, unknown> = {}): Promise<LoanDetail> {
  const response = await t.post(`/tractors/${String(tractor.id)}/loans`, {
    ...loanBody,
    ...overrides,
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<LoanDetail>();
}

function pay(loan: LoanDetail, body: Record<string, unknown>, key?: string) {
  return t.post(
    `/loans/${String(loan.id)}/emi`,
    { paidOn: "2026-10-20", amount: 25000, mode: "ONLINE", ...body },
    key,
  );
}

async function paid(loan: LoanDetail, body: Record<string, unknown>): Promise<LoanPaymentSaved> {
  const response = await pay(loan, body);
  expect(response.statusCode, response.body).toBe(201);
  return response.json<LoanPaymentSaved>();
}

describe("creating a loan", () => {
  it("records the terms and shows the full schedule as of today", async () => {
    const loan = await makeLoan();

    expect(loan).toMatchObject({
      tractor: { id: tractor.id, regNumber: "RJ19AB0001" },
      lender: "Mahindra Finance",
      emiPaise: 2_500_000,
      firstEmiMonth: "2026-08",
      lastEmiMonth: "2026-10",
      closedOn: null,
      paidPaise: 0,
      summary: {
        paidCount: 0,
        overdueCount: 3,
        nextDue: { month: "2026-08", dueDate: "2026-08-10" },
      },
    });
    expect(loan.schedule.map((row) => row.status)).toEqual(["OVERDUE", "OVERDUE", "OVERDUE"]);
  });

  it("allows only one open loan per tractor", async () => {
    await makeLoan();

    const second = await t.post(`/tractors/${String(tractor.id)}/loans`, loanBody);

    expect(second.statusCode).toBe(409);
  });

  it.each([
    ["an EMI day of 29", { emiDay: 29 }],
    ["an EMI day of 0", { emiDay: 0 }],
    ["no instalments", { totalInstallments: 0 }],
    ["more than 120 instalments", { totalInstallments: 121 }],
    ["a zero EMI", { emiAmount: 0 }],
    ["a bad month", { firstEmiMonth: "2026-13" }],
    ["an unknown field", { interestRate: 12 }],
  ])("refuses %s", async (_label, overrides) => {
    expect(
      (await t.post(`/tractors/${String(tractor.id)}/loans`, { ...loanBody, ...overrides }))
        .statusCode,
    ).toBe(400);
  });

  it("refuses an inactive or unknown tractor", async () => {
    const parked = await makeTractor(t);
    await t.patch(`/tractors/${String(parked.id)}`, { isActive: false });

    expect((await t.post(`/tractors/${String(parked.id)}/loans`, loanBody)).statusCode).toBe(409);
    expect((await t.post("/tractors/99999/loans", loanBody)).statusCode).toBe(404);
  });

  it("renames the lender and deletes a loan with no payments", async () => {
    const loan = await makeLoan();

    expect(
      (await t.patch(`/loans/${String(loan.id)}`, { lender: "SBI" })).json<LoanDetail>().lender,
    ).toBe("SBI");
    expect((await t.delete(`/loans/${String(loan.id)}`)).statusCode).toBe(204);
    expect((await t.get(`/loans/${String(loan.id)}`)).statusCode).toBe(404);
  });
});

describe("paying EMIs", () => {
  it("records an instalment as a tractor expense and marks the month paid", async () => {
    const loan = await makeLoan();

    const saved = await paid(loan, { emiMonth: "2026-08", reference: "NEFT-1" });

    expect(saved.warnings).toEqual([]);
    expect(saved.loan.schedule[0]).toMatchObject({
      status: "PAID",
      payment: { expenseId: saved.expenseId, paidOn: "2026-10-20", amountPaise: 2_500_000 },
    });
    expect(saved.loan.summary.paidCount).toBe(1);
    const expenses = (
      await t.get(`/expenses?category=TRACTOR_EMI&tractorId=${String(tractor.id)}`)
    ).json<ExpensePage>();
    expect(expenses.items[0]).toMatchObject({
      tractorLoanId: loan.id,
      emiMonth: "2026-08",
      amountPaise: 2_500_000,
    });
  });

  it("adds a late fee inside the amount paid", async () => {
    const loan = await makeLoan();

    const saved = await paid(loan, { emiMonth: "2026-08", lateFee: 500 });

    expect(saved.loan.schedule[0]?.payment).toMatchObject({
      amountPaise: 2_550_000,
      lateFeePaise: 50_000,
    });
  });

  it("warns when the amount differs from the EMI", async () => {
    const loan = await makeLoan();

    const saved = await paid(loan, { emiMonth: "2026-08", amount: 24000 });

    expect(saved.warnings).toEqual(["Paid ₹24,000.00; the EMI is ₹25,000.00"]);
  });

  it("refuses paying a month twice or outside the schedule", async () => {
    const loan = await makeLoan();
    await paid(loan, { emiMonth: "2026-08" });

    expect((await pay(loan, { emiMonth: "2026-08" })).statusCode).toBe(409);
    expect((await pay(loan, { emiMonth: "2026-07" })).statusCode).toBe(400);
    expect((await pay(loan, { emiMonth: "2026-11" })).statusCode).toBe(400);
  });

  it("records one payment for a replayed request", async () => {
    const loan = await makeLoan();

    await pay(loan, { emiMonth: "2026-08" }, "emi-key-0001");
    const replay = await pay(loan, { emiMonth: "2026-08" }, "emi-key-0001");

    expect(replay.headers["idempotent-replay"]).toBe("true");
    expect(await t.db.expense.count({ where: { category: "TRACTOR_EMI" } })).toBe(1);
  });

  it("closes the loan when the last instalment is paid, and reopens it if that is reversed", async () => {
    const loan = await makeLoan();
    await paid(loan, { emiMonth: "2026-08" });
    await paid(loan, { emiMonth: "2026-09" });

    const last = await paid(loan, { emiMonth: "2026-10", paidOn: "2026-10-25" });

    expect(last.loan).toMatchObject({
      closedOn: "2026-10-25",
      closedReason: "PAID_OFF",
      paidPaise: 7_500_000,
    });
    expect((await pay(loan, { emiMonth: "2026-10" })).statusCode).toBe(409);
    expect((await t.get("/loans")).json<LoanDto[]>()).toEqual([]);

    const reopened = await t.delete(`/loans/${String(loan.id)}/payments/${String(last.expenseId)}`);

    expect(reopened.json<LoanDetail>()).toMatchObject({ closedOn: null, closedReason: null });
    expect(reopened.json<LoanDetail>().schedule[2]?.status).toBe("OVERDUE");
  });

  it("will not reopen a paid-off loan once the tractor has a new one", async () => {
    const loan = await makeLoan({ totalInstallments: 1 });
    const last = await paid(loan, { emiMonth: "2026-08" });
    await makeLoan({ lender: "New lender" });

    const response = await t.delete(`/loans/${String(loan.id)}/payments/${String(last.expenseId)}`);

    expect(response.statusCode).toBe(409);
  });

  it("refuses a loan with payment history being deleted", async () => {
    const loan = await makeLoan();
    const saved = await paid(loan, { emiMonth: "2026-08" });
    await t.delete(`/loans/${String(loan.id)}/payments/${String(saved.expenseId)}`);

    expect((await t.delete(`/loans/${String(loan.id)}`)).statusCode).toBe(409);
  });

  it("is refused through the general expense screen", async () => {
    const loan = await makeLoan();
    const saved = await paid(loan, { emiMonth: "2026-08" });

    expect((await t.patch(`/expenses/${String(saved.expenseId)}`, { amount: 1 })).statusCode).toBe(
      409,
    );
    expect((await t.delete(`/expenses/${String(saved.expenseId)}`)).statusCode).toBe(409);
    expect(
      (
        await t.post("/expenses", {
          category: "TRACTOR_EMI",
          spentOn: "2026-10-20",
          amount: 1,
          mode: "CASH",
        })
      ).statusCode,
    ).toBe(400);
  });

  it("404s an unknown loan or payment", async () => {
    const loan = await makeLoan();

    expect((await pay({ ...loan, id: 99999 }, { emiMonth: "2026-08" })).statusCode).toBe(404);
    expect((await t.delete(`/loans/${String(loan.id)}/payments/99999`)).statusCode).toBe(404);
  });
});

describe("foreclosure", () => {
  it("pays off the rest in one go and closes the remaining months", async () => {
    const loan = await makeLoan();
    await paid(loan, { emiMonth: "2026-08" });

    const response = await t.post(`/loans/${String(loan.id)}/foreclose`, {
      closedOn: "2026-10-22",
      amount: 48000,
      mode: "ONLINE",
    });

    const saved = response.json<LoanPaymentSaved>();
    expect(saved.loan).toMatchObject({
      closedOn: "2026-10-22",
      closedReason: "FORECLOSED",
      paidPaise: 7_300_000,
    });
    expect(saved.loan.schedule.map((row) => row.status)).toEqual(["PAID", "CLOSED", "CLOSED"]);
    expect(
      (
        await t.post(`/loans/${String(loan.id)}/foreclose`, {
          closedOn: "2026-10-22",
          amount: 1,
          mode: "CASH",
        })
      ).statusCode,
    ).toBe(409);
  });

  it("reopens when the foreclosure payment is reversed", async () => {
    const loan = await makeLoan();
    const saved = (
      await t.post(`/loans/${String(loan.id)}/foreclose`, {
        closedOn: "2026-10-22",
        amount: 70000,
        mode: "CASH",
      })
    ).json<LoanPaymentSaved>();

    const response = await t.delete(
      `/loans/${String(loan.id)}/payments/${String(saved.expenseId)}`,
    );

    expect(response.json<LoanDetail>()).toMatchObject({ closedOn: null, closedReason: null });
  });
});

describe("GET /emi/due", () => {
  it("lists overdue and soon-due instalments across tractors, oldest first", async () => {
    const other = await makeTractor(t, { regNumber: "RJ19AB0002" });
    const loan = await makeLoan({ firstEmiMonth: "2026-10", emiDay: 25 });
    await t.post(`/tractors/${String(other.id)}/loans`, {
      ...loanBody,
      firstEmiMonth: "2026-11",
      emiDay: 2,
    });
    await paid(loan, { emiMonth: "2026-10" });

    const due = (await t.get("/emi/due?days=7")).json<EmiDue>();

    expect(due.asOf).toBe("2026-10-28");
    expect(
      due.items.map((item) => [item.tractor.regNumber, item.month, item.status, item.daysLate]),
    ).toEqual([["RJ19AB0002", "2026-11", "UPCOMING", -5]]);
  });

  it("moves an instalment from upcoming to due today to overdue as the days pass", async () => {
    await makeLoan({ firstEmiMonth: "2026-11", emiDay: 1, totalInstallments: 1 });
    const statusOn = async (now: string) => {
      t.setNow(now);
      return (await t.get("/emi/due?days=7"))
        .json<EmiDue>()
        .items.map((item) => [item.status, item.daysLate]);
    };

    expect(await statusOn("2026-10-28T06:30:00Z")).toEqual([["UPCOMING", -4]]);
    expect(await statusOn("2026-10-31T18:31:00Z")).toEqual([["DUE_TODAY", 0]]);
    expect(await statusOn("2026-11-01T18:31:00Z")).toEqual([["OVERDUE", 1]]);
  });

  it("leaves out instalments further away than asked", async () => {
    await makeLoan({ firstEmiMonth: "2026-12", emiDay: 1, totalInstallments: 1 });

    expect((await t.get("/emi/due?days=7")).json<EmiDue>().items).toEqual([]);
    expect((await t.get("/emi/due?days=40")).json<EmiDue>().items).toHaveLength(1);
  });

  it("ignores closed loans", async () => {
    const loan = await makeLoan();
    await t.post(`/loans/${String(loan.id)}/foreclose`, {
      closedOn: "2026-10-22",
      amount: 70000,
      mode: "CASH",
    });

    expect((await t.get("/emi/due")).json<EmiDue>().items).toEqual([]);
    expect(errorOf(await t.get("/emi/due?days=999")).code).toBe("VALIDATION");
  });
});

describe("review fixes", () => {
  it("closes a paid-off loan on its latest payment date, even if a month was entered late", async () => {
    const loan = await makeLoan({ totalInstallments: 2 });
    await paid(loan, { emiMonth: "2026-09", paidOn: "2026-10-10" });

    const last = await paid(loan, { emiMonth: "2026-08", paidOn: "2026-08-12" });

    expect(last.loan.closedOn).toBe("2026-10-10");
  });

  it("names the payment that closed a loan early, so it can be undone", async () => {
    const loan = await makeLoan();
    const closing = await t.post(`/loans/${String(loan.id)}/foreclose`, {
      closedOn: "2026-10-22",
      amount: 48000,
      mode: "CASH",
    });
    const { expenseId } = closing.json<{ expenseId: number }>();

    const closed = (await t.get(`/loans/${String(loan.id)}`)).json<LoanDetail>();
    expect(closed.foreclosure).toEqual({ expenseId, paidOn: "2026-10-22", amountPaise: 4_800_000 });

    const reopened = await t.delete(`/loans/${String(loan.id)}/payments/${String(expenseId)}`);
    expect(reopened.json<LoanDetail>()).toMatchObject({ closedOn: null, foreclosure: null });
  });

  it("has no closing payment on a loan still running", async () => {
    const loan = await makeLoan();

    expect((await t.get(`/loans/${String(loan.id)}`)).json<LoanDetail>().foreclosure).toBeNull();
  });

  it("keeps a foreclosed loan closed when a monthly payment is reversed", async () => {
    const loan = await makeLoan();
    const monthly = await paid(loan, { emiMonth: "2026-08" });
    await t.post(`/loans/${String(loan.id)}/foreclose`, {
      closedOn: "2026-10-22",
      amount: 48000,
      mode: "CASH",
    });

    const response = await t.delete(
      `/loans/${String(loan.id)}/payments/${String(monthly.expenseId)}`,
    );

    expect(response.json<LoanDetail>()).toMatchObject({ closedReason: "FORECLOSED" });
  });

  it("refuses restoring a reversed EMI through the general expense screen", async () => {
    const loan = await makeLoan();
    const saved = await paid(loan, { emiMonth: "2026-08" });
    await t.delete(`/loans/${String(loan.id)}/payments/${String(saved.expenseId)}`);

    expect((await t.post(`/expenses/${String(saved.expenseId)}/restore`)).statusCode).toBe(409);
  });
});
