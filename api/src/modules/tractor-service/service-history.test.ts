import { beforeEach, describe, expect, it } from "vitest";
import { useTestApp } from "../../../test/app.ts";
import { makeSettings, makeTractor } from "../../../test/factories.ts";
import type { ExpenseSaved } from "../expenses/expenses.schema.ts";
import type { TractorDto } from "../tractors/tractors.schema.ts";
import type { ServiceHistory } from "./service-history.schema.ts";

const t = useTestApp();
let tractor: TractorDto;

beforeEach(async () => {
  await makeSettings(t);
  tractor = await makeTractor(t);
});

async function service(overrides: Record<string, unknown> = {}): Promise<ExpenseSaved> {
  const response = await t.post("/expenses", {
    category: "TRACTOR_SERVICE",
    spentOn: "2026-10-01",
    amount: 3500,
    mode: "CASH",
    tractorId: tractor.id,
    notes: "oil and filter change",
    ...overrides,
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<ExpenseSaved>();
}

describe("tractor service", () => {
  it("records the work done and the hour meter", async () => {
    const saved = await service({ hourMeter: 1250 });

    expect(saved.expense).toMatchObject({
      category: "TRACTOR_SERVICE",
      tractor: { id: tractor.id },
      hourMeter: 1250,
      notes: "oil and filter change",
    });
  });

  it.each([
    ["no tractor", { tractorId: undefined }],
    ["no note of the work", { notes: undefined }],
    ["a negative hour meter", { hourMeter: -1 }],
    ["a fractional hour meter", { hourMeter: 12.5 }],
  ])("refuses a service with %s", async (_label, overrides) => {
    const response = await t.post("/expenses", {
      category: "TRACTOR_SERVICE",
      spentOn: "2026-10-01",
      amount: 3500,
      mode: "CASH",
      tractorId: tractor.id,
      notes: "x",
      ...overrides,
    });

    expect(response.statusCode).toBe(400);
  });

  it("warns when the hour meter goes backwards", async () => {
    await service({ spentOn: "2026-09-01", hourMeter: 1300 });
    await service({ spentOn: "2026-10-20", hourMeter: 1500 });

    const saved = await service({ spentOn: "2026-10-01", hourMeter: 1200 });

    expect(saved.warnings).toEqual(["Hour meter 1200 is below the 1300 recorded on 2026-09-01"]);
    const later = await service({ spentOn: "2026-10-10", hourMeter: 1600 });
    expect(later.warnings).toEqual([
      "Hour meter 1600 is above the 1500 recorded later on 2026-10-20",
    ]);
  });

  it("edits the work and hour meter but never drops the tractor", async () => {
    const saved = await service({ hourMeter: 1250 });
    const url = `/expenses/${String(saved.expense.id)}`;

    const edited = await t.patch(url, { hourMeter: 1260, notes: "oil, filter and greasing" });

    expect(edited.json<ExpenseSaved>().expense).toMatchObject({ hourMeter: 1260 });
    expect((await t.patch(url, { tractorId: null })).statusCode).toBe(400);
    expect((await t.patch(url, { notes: null })).statusCode).toBe(400);
  });
});

describe("GET /tractors/:id/services", () => {
  it("lists services newest first with the last service up front", async () => {
    await service({ spentOn: "2026-08-01", hourMeter: 1000, notes: "first service" });
    await service({ spentOn: "2026-10-01", hourMeter: 1250, notes: "second service" });
    const removed = await service({ spentOn: "2026-10-15", notes: "entered by mistake" });
    await t.delete(`/expenses/${String(removed.expense.id)}`);

    const history = (
      await t.get(`/tractors/${String(tractor.id)}/services`)
    ).json<ServiceHistory>();

    expect(history.lastService).toEqual({
      date: "2026-10-01",
      hourMeter: 1250,
      notes: "second service",
    });
    expect(history.services.map((row) => row.notes)).toEqual(["second service", "first service"]);
  });

  it("has no last service for a tractor never serviced, and 404s an unknown tractor", async () => {
    const history = (
      await t.get(`/tractors/${String(tractor.id)}/services`)
    ).json<ServiceHistory>();

    expect(history).toMatchObject({ lastService: null, services: [] });
    expect((await t.get("/tractors/99999/services")).statusCode).toBe(404);
  });
});

describe("hour meter on the same day", () => {
  it("does not warn about two services on one day", async () => {
    await service({ spentOn: "2026-10-01", hourMeter: 100, notes: "oil change" });

    const saved = await service({ spentOn: "2026-10-01", hourMeter: 105, notes: "repair" });

    expect(saved.warnings).toEqual([]);
  });
});
