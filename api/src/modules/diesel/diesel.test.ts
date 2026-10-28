import { beforeEach, describe, expect, it } from "vitest";
import { useTestApp } from "../../../test/app.ts";
import {
  makeDriver,
  makeTractor,
  makeTrip,
  makeTripMasters,
  type TripMasters,
} from "../../../test/factories.ts";
import type { ExpenseDto, ExpensePage, ExpenseSaved } from "../expenses/expenses.schema.ts";
import type { DieselReport } from "./diesel.schema.ts";

const t = useTestApp();
let m: TripMasters;

beforeEach(async () => {
  m = await makeTripMasters(t);
});

function fill(overrides: Record<string, unknown> = {}) {
  return t.post("/expenses", {
    category: "DIESEL",
    spentOn: "2026-10-20",
    amount: 4500,
    mode: "CASH",
    tractorId: m.tractor.id,
    driverId: m.driver.id,
    litres: 50,
    ...overrides,
  });
}

async function addFill(overrides: Record<string, unknown> = {}): Promise<ExpenseSaved> {
  const response = await fill(overrides);
  expect(response.statusCode, response.body).toBe(201);
  return response.json<ExpenseSaved>();
}

describe("recording a diesel fill", () => {
  it("stores litres exactly and names the tractor and driver", async () => {
    const saved = await addFill({ litres: "45.5", amount: "4095.00" });

    expect(saved.expense).toMatchObject({
      category: "DIESEL",
      dieselLitres: 45.5,
      amountPaise: 409_500,
      tractor: { id: m.tractor.id },
      driver: { id: m.driver.id },
    });
    expect(saved.warnings).toEqual([]);
    expect((await t.db.expense.findFirstOrThrow()).dieselMl).toBe(45_500);
  });

  it.each([
    ["no tractor", { tractorId: undefined }],
    ["no driver", { driverId: undefined }],
    ["no litres", { litres: undefined }],
    ["zero litres", { litres: 0 }],
    ["more than a fill can hold", { litres: 600 }],
    ["three decimals", { litres: "45.125" }],
    ["a labourer", { labourerId: 1 }],
  ])("refuses a fill with %s", async (_label, overrides) => {
    expect((await fill(overrides)).statusCode).toBe(400);
  });

  it("refuses an inactive tractor and an unknown driver", async () => {
    const parked = await makeTractor(t);
    await t.patch(`/tractors/${String(parked.id)}`, { isActive: false });

    expect((await fill({ tractorId: parked.id })).statusCode).toBe(409);
    expect((await fill({ driverId: 99999 })).statusCode).toBe(404);
  });

  it("warns when the price per litre looks like a typo", async () => {
    const saved = await addFill({ litres: 45, amount: 9000 });

    expect(saved.warnings).toEqual([
      "₹200.00 per litre looks wrong; check the litres and the amount",
    ]);
  });

  it("warns when the driver is filling a tractor that is not theirs", async () => {
    const other = await makeTractor(t, { regNumber: "RJ19ZZ0001" });

    const saved = await addFill({ tractorId: other.id });

    expect(saved.warnings).toEqual([
      `${m.driver.name} usually drives ${m.tractor.regNumber}; this fill is for RJ19ZZ0001`,
    ]);
  });
});

describe("editing a diesel fill", () => {
  it("corrects litres and amount and re-checks the price", async () => {
    const saved = await addFill();
    const url = `/expenses/${String(saved.expense.id)}`;

    const fixed = (await t.patch(url, { litres: 55 })).json<ExpenseSaved>();
    const typo = (await t.patch(url, { amount: 45 })).json<ExpenseSaved>();

    expect(fixed.expense.dieselLitres).toBe(55);
    expect(fixed.warnings).toEqual([]);
    expect(typo.warnings[0]).toContain("per litre looks wrong");
  });

  it("refuses removing the tractor or driver", async () => {
    const saved = await addFill();
    const url = `/expenses/${String(saved.expense.id)}`;

    expect((await t.patch(url, { tractorId: null })).statusCode).toBe(400);
    expect((await t.patch(url, { driverId: null })).statusCode).toBe(400);
  });

  it("deletes and restores a fill", async () => {
    const saved = await addFill();
    const url = `/expenses/${String(saved.expense.id)}`;

    expect((await t.delete(url)).json<ExpenseDto>().deletedAt).not.toBeNull();
    expect((await t.post(`${url}/restore`)).json<ExpenseDto>().deletedAt).toBeNull();
  });

  it("lists fills by tractor with the diesel total", async () => {
    await addFill({ amount: 4500 });
    const other = await makeTractor(t);
    await addFill({ tractorId: other.id, amount: 1000, litres: 11 });

    const page = (
      await t.get(`/expenses?category=DIESEL&tractorId=${String(m.tractor.id)}`)
    ).json<ExpensePage>();

    expect(page.total).toBe(1);
    expect(page.totals.byCategory.DIESEL).toBe(450_000);
  });
});

describe("GET /reports/diesel", () => {
  it("shows litres, money and litres per trip for each tractor and driver", async () => {
    const spare = await makeTractor(t, { regNumber: "RJ19ZZ9999", label: "Spare" });
    const relief = await makeDriver(t, { name: "Relief driver" });
    await makeTrip(t, m, { tripDate: "2026-10-10" });
    await makeTrip(t, m, { tripDate: "2026-10-11" });
    await makeTrip(t, m, { tripDate: "2026-10-12" });
    await makeTrip(t, m, { tripDate: "2026-10-13" });
    await addFill({ litres: "30.5", amount: 2745, spentOn: "2026-10-10" });
    await addFill({ litres: "19.5", amount: 1755, spentOn: "2026-10-12" });
    await addFill({ tractorId: spare.id, driverId: relief.id, litres: 10, amount: 900 });
    const removed = await addFill({ litres: 100, amount: 9000 });
    await t.delete(`/expenses/${String(removed.expense.id)}`);

    const report = (
      await t.get("/reports/diesel?from=2026-10-01&to=2026-10-31")
    ).json<DieselReport>();

    expect(report.tractors).toEqual([
      {
        tractor: { id: m.tractor.id, regNumber: m.tractor.regNumber, label: m.tractor.label },
        litres: 50,
        amountPaise: 450_000,
        trips: 4,
        litresPerTrip: 12.5,
      },
      {
        tractor: { id: spare.id, regNumber: "RJ19ZZ9999", label: "Spare" },
        litres: 10,
        amountPaise: 90_000,
        trips: 0,
        litresPerTrip: null,
      },
    ]);
    expect(report.drivers.map((row) => [row.driver.name, row.litres, row.trips])).toEqual([
      [m.driver.name, 50, 4],
      ["Relief driver", 10, 0],
    ]);
    expect(report.totals).toEqual({ litres: 60, amountPaise: 540_000, trips: 4 });
  });

  it("only counts fills and trips inside the dates", async () => {
    await makeTrip(t, m, { tripDate: "2026-09-30" });
    await addFill({ spentOn: "2026-09-30" });
    await addFill({ spentOn: "2026-10-01", litres: 20, amount: 1800 });

    const report = (await t.get("/reports/diesel?from=2026-10-01")).json<DieselReport>();

    expect(report.totals).toEqual({ litres: 20, amountPaise: 180_000, trips: 0 });
  });

  it("is empty, not an error, when nothing happened", async () => {
    const report = (
      await t.get("/reports/diesel?from=2026-10-01&to=2026-10-01")
    ).json<DieselReport>();

    expect(report).toEqual({
      from: "2026-10-01",
      to: "2026-10-01",
      tractors: [],
      drivers: [],
      totals: { litres: 0, amountPaise: 0, trips: 0 },
    });
  });

  it("exports the tractor rows as CSV", async () => {
    await addFill();

    const csv = await t.get("/reports/diesel/export?from=2026-10-01&to=2026-10-31");

    expect(csv.headers["content-disposition"]).toContain("diesel_2026-10-01_to_2026-10-31.csv");
    expect(csv.body).toContain(`Tractor,${m.tractor.regNumber} (${m.tractor.label}),50,4500.00,0,`);
    expect(csv.body).toContain(`Driver,${m.driver.name},50,4500.00,0,`);
  });
});
