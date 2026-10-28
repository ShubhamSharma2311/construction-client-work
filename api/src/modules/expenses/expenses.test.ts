import { beforeEach, describe, expect, it } from "vitest";
import { errorOf, useTestApp } from "../../../test/app.ts";
import { makeDriver, makeLabourer, makeSettings, makeTractor } from "../../../test/factories.ts";
import type { LabourerDto } from "../labourers/labourers.schema.ts";
import type { ExpenseDto, ExpensePage, ExpenseSaved } from "./expenses.schema.ts";

const t = useTestApp();
let labourer: LabourerDto;

beforeEach(async () => {
  await makeSettings(t);
  labourer = await makeLabourer(t, { name: "Kanaram" });
});

const base = { spentOn: "2026-10-20", amount: 500, mode: "CASH" };

async function add(body: Record<string, unknown>): Promise<ExpenseSaved> {
  const response = await t.post("/expenses", { ...base, ...body });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<ExpenseSaved>();
}

describe("recording expenses by category", () => {
  it("records labour paid to a labourer", async () => {
    const saved = await add({ category: "LABOUR", labourerId: labourer.id, amount: 700 });

    expect(saved.expense).toMatchObject({
      category: "LABOUR",
      spentOn: "2026-10-20",
      amountPaise: 70_000,
      mode: "CASH",
      labourer: { id: labourer.id, name: "Kanaram" },
    });
    expect(await t.db.auditLog.count({ where: { entity: "Expense" } })).toBe(1);
  });

  it("records a royalty with its period and receipt number", async () => {
    const saved = await add({
      category: "ROYALTY",
      amount: 25000,
      mode: "ONLINE",
      periodFrom: "2026-10-01",
      periodTo: "2026-10-31",
      reference: "RCPT-88",
    });

    expect(saved.expense).toMatchObject({
      periodFrom: "2026-10-01",
      periodTo: "2026-10-31",
      reference: "RCPT-88",
    });
    expect(saved.warnings).toEqual([]);
  });

  it("warns about a royalty overlapping an earlier one", async () => {
    const first = await add({
      category: "ROYALTY",
      periodFrom: "2026-10-01",
      periodTo: "2026-10-15",
    });

    const second = await add({
      category: "ROYALTY",
      periodFrom: "2026-10-10",
      periodTo: "2026-10-31",
    });

    expect(second.warnings).toEqual([
      `Royalty #${String(first.expense.id)} already covers 2026-10-01 to 2026-10-15`,
    ]);
  });

  it.each(["POLICE", "OTHER"])("records %s money with a note", async (category) => {
    const saved = await add({ category, notes: "checkpost near Pipar" });

    expect(saved.expense).toMatchObject({ category, notes: "checkpost near Pipar" });
  });

  it("records an emergency spend with the tractor and driver involved", async () => {
    const tractor = await makeTractor(t);
    const driver = await makeDriver(t);

    const saved = await add({
      category: "EMERGENCY",
      notes: "tyre burst on highway",
      tractorId: tractor.id,
      driverId: driver.id,
    });

    expect(saved.expense).toMatchObject({
      tractor: { id: tractor.id },
      driver: { id: driver.id },
    });
  });
});

describe("expense rules", () => {
  it.each([
    ["labour without a labourer", { category: "LABOUR" }],
    ["police without a note", { category: "POLICE" }],
    ["other with a blank note", { category: "OTHER", notes: "   " }],
    ["emergency without a note", { category: "EMERGENCY" }],
    ["a field the category does not take", { category: "POLICE", notes: "x", labourerId: 1 }],
    ["diesel litres on a police entry", { category: "POLICE", notes: "x", dieselLitres: 5 }],
    [
      "a royalty period backwards",
      { category: "ROYALTY", periodFrom: "2026-10-31", periodTo: "2026-10-01" },
    ],
    ["an EMI entered here", { category: "TRACTOR_EMI" }],
    ["no mode", { category: "OTHER", notes: "x", mode: undefined }],
    ["a future date", { category: "OTHER", notes: "x", spentOn: "2026-10-29" }],
    ["zero amount", { category: "OTHER", notes: "x", amount: 0 }],
  ])("rejects %s with 400", async (_label, body) => {
    expect((await t.post("/expenses", { ...base, ...body })).statusCode).toBe(400);
  });

  it("refuses an inactive labourer and 404s an unknown one", async () => {
    await t.patch(`/labourers/${String(labourer.id)}`, { isActive: false });

    expect(
      (await t.post("/expenses", { ...base, category: "LABOUR", labourerId: labourer.id }))
        .statusCode,
    ).toBe(409);
    expect(
      (await t.post("/expenses", { ...base, category: "LABOUR", labourerId: 99999 })).statusCode,
    ).toBe(404);
  });

  it("refuses entries before settings exist", async () => {
    await t.db.setting.deleteMany();

    expect((await t.post("/expenses", { ...base, category: "OTHER", notes: "x" })).statusCode).toBe(
      409,
    );
  });

  it("records one expense for a replayed request", async () => {
    const body = { ...base, category: "OTHER", notes: "tea for loaders" };

    await t.post("/expenses", body, "expense-key-01");
    const replay = await t.post("/expenses", body, "expense-key-01");

    expect(replay.headers["idempotent-replay"]).toBe("true");
    expect(await t.db.expense.count()).toBe(1);
  });

  it("is backed by database rules when the API is bypassed", async () => {
    const insert = (data: Record<string, unknown>) =>
      t.db.expense.create({
        data: {
          spentOn: new Date("2026-10-20"),
          amountPaise: 100,
          mode: "CASH",
          category: "OTHER",
          ...data,
        },
      });

    await expect(insert({ category: "LABOUR" })).rejects.toThrow();
    await expect(insert({ category: "POLICE", notes: " " })).rejects.toThrow();
    await expect(insert({ notes: "x", dieselMl: 1000 })).rejects.toThrow();
    await expect(insert({ notes: "x", amountPaise: 0 })).rejects.toThrow();
  });
});

describe("editing, deleting and restoring", () => {
  it("edits the fields its category takes and audits them", async () => {
    const saved = await add({ category: "LABOUR", labourerId: labourer.id });
    const other = await makeLabourer(t, { name: "Bhanwar" });

    const response = await t.patch(`/expenses/${String(saved.expense.id)}`, {
      amount: 650,
      labourerId: other.id,
      mode: "ONLINE",
    });

    expect(response.json<ExpenseSaved>().expense).toMatchObject({
      amountPaise: 65_000,
      mode: "ONLINE",
      labourer: { name: "Bhanwar" },
    });
    expect(await t.db.auditLog.count({ where: { entity: "Expense", action: "UPDATE" } })).toBe(1);
  });

  it.each([
    ["a field the category does not take", { periodFrom: "2026-10-01" }],
    ["clearing a required note", { notes: null }],
    ["a future date", { spentOn: "2026-10-29" }],
  ])("refuses %s", async (_label, body) => {
    const saved = await add({ category: "POLICE", notes: "checkpost" });

    expect((await t.patch(`/expenses/${String(saved.expense.id)}`, body)).statusCode).toBe(400);
  });

  it("checks a royalty period against the stored end when only the start changes", async () => {
    const saved = await add({
      category: "ROYALTY",
      periodFrom: "2026-10-01",
      periodTo: "2026-10-15",
    });

    const response = await t.patch(`/expenses/${String(saved.expense.id)}`, {
      periodFrom: "2026-10-20",
    });

    expect(response.statusCode).toBe(400);
  });

  it("keeps a labourer deactivated after the entry but refuses switching to one", async () => {
    const saved = await add({ category: "LABOUR", labourerId: labourer.id });
    const other = await makeLabourer(t);
    await t.patch(`/labourers/${String(labourer.id)}`, { isActive: false });
    await t.patch(`/labourers/${String(other.id)}`, { isActive: false });
    const url = `/expenses/${String(saved.expense.id)}`;

    expect((await t.patch(url, { amount: 600 })).statusCode).toBe(200);
    expect((await t.patch(url, { labourerId: other.id })).statusCode).toBe(409);
  });

  it("soft-deletes and restores, and refuses editing a deleted entry", async () => {
    const saved = await add({ category: "OTHER", notes: "x" });
    const url = `/expenses/${String(saved.expense.id)}`;

    expect((await t.delete(url)).json<ExpenseDto>().deletedAt).not.toBeNull();
    expect((await t.patch(url, { amount: 1 })).statusCode).toBe(409);
    expect((await t.delete(url)).statusCode).toBe(409);
    expect((await t.get("/expenses")).json<ExpensePage>().total).toBe(0);
    expect((await t.post(`${url}/restore`)).json<ExpenseDto>().deletedAt).toBeNull();
    expect((await t.post(`${url}/restore`)).statusCode).toBe(409);
  });

  it("refuses to restore an expense dated before a moved business start", async () => {
    const old = await add({ category: "OTHER", notes: "x", spentOn: "2026-04-05" });
    await t.delete(`/expenses/${String(old.expense.id)}`);
    await makeSettings(t, { businessStartDate: "2026-05-01" });

    expect((await t.post(`/expenses/${String(old.expense.id)}/restore`)).statusCode).toBe(400);
  });

  it("404s an unknown expense", async () => {
    expect((await t.get("/expenses/99999")).statusCode).toBe(404);
    expect((await t.patch("/expenses/99999", { amount: 1 })).statusCode).toBe(404);
    expect((await t.delete("/expenses/99999")).statusCode).toBe(404);
  });
});

describe("listing and totals", () => {
  async function seed() {
    await add({ category: "LABOUR", labourerId: labourer.id, amount: 700, spentOn: "2026-10-01" });
    await add({
      category: "POLICE",
      notes: "x",
      amount: 200,
      spentOn: "2026-10-05",
      mode: "ONLINE",
    });
    await add({ category: "POLICE", notes: "y", amount: 300, spentOn: "2026-10-10" });
    await add({ category: "ROYALTY", amount: 5000, spentOn: "2026-10-12" });
  }

  it("totals by category over every match, and the totals equal the rows", async () => {
    await seed();

    const page = (await t.get("/expenses?limit=2")).json<ExpensePage>();
    const all = (await t.get("/expenses?limit=200")).json<ExpensePage>();

    expect(page.items).toHaveLength(2);
    expect(page.totals.amountPaise).toBe(620_000);
    expect(page.totals.byCategory).toMatchObject({
      LABOUR: 70_000,
      POLICE: 50_000,
      ROYALTY: 500_000,
      DIESEL: 0,
    });
    expect(all.items.reduce((sum, row) => sum + row.amountPaise, 0)).toBe(page.totals.amountPaise);
  });

  it.each([
    ["category=POLICE", 2],
    ["mode=ONLINE", 1],
    ["from=2026-10-05&to=2026-10-10", 2],
    ["deleted=true", 0],
  ])("filters by %s", async (query, count) => {
    await seed();

    expect((await t.get(`/expenses?${query}`)).json<ExpensePage>().total).toBe(count);
  });

  it("filters by labourer and exports CSV", async () => {
    await seed();

    const byLabourer = (
      await t.get(`/expenses?labourerId=${String(labourer.id)}`)
    ).json<ExpensePage>();
    const csv = await t.get("/expenses/export?category=POLICE");

    expect(byLabourer.total).toBe(1);
    expect(csv.headers["content-disposition"]).toContain("expenses.csv");
    expect(csv.body.split("\r\n").filter((line) => line.includes("POLICE"))).toHaveLength(2);
  });

  it("stops the business start moving past an expense", async () => {
    await add({ category: "OTHER", notes: "x", spentOn: "2026-05-01" });

    const response = await t.put("/settings", {
      businessName: "Godara Bajri",
      businessStartDate: "2026-06-01",
      openingCash: 0,
      openingOnline: 0,
    });

    expect(response.statusCode).toBe(409);
    expect(errorOf(response).details).toEqual({ earliestEntryDate: "2026-05-01" });
  });
});

describe("review fixes", () => {
  it("deletes once when two deletes arrive together", async () => {
    const saved = await add({ category: "OTHER", notes: "x" });
    const url = `/expenses/${String(saved.expense.id)}`;

    const results = await Promise.all([t.delete(url), t.delete(url)]);

    expect(results.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect(await t.db.auditLog.count({ where: { entity: "Expense", action: "DELETE" } })).toBe(1);
  });

  it("refuses a field that does not exist on an edit", async () => {
    const saved = await add({ category: "OTHER", notes: "x" });

    const response = await t.patch(`/expenses/${String(saved.expense.id)}`, {
      category: "POLICE",
      amount: 5,
    });

    expect(response.statusCode).toBe(400);
  });

  it.each([
    ["only a start", { periodFrom: "2026-10-01" }],
    ["only an end", { periodTo: "2026-10-31" }],
  ])("refuses a royalty period with %s", async (_label, period) => {
    expect(
      (await t.post("/expenses", { ...base, category: "ROYALTY", ...period })).statusCode,
    ).toBe(400);
  });

  it("refuses clearing one end of a royalty period", async () => {
    const saved = await add({
      category: "ROYALTY",
      periodFrom: "2026-10-01",
      periodTo: "2026-10-31",
    });

    const response = await t.patch(`/expenses/${String(saved.expense.id)}`, { periodTo: null });

    expect(response.statusCode).toBe(400);
  });

  it("refuses at the database to hard-delete a labourer who has expenses", async () => {
    await add({ category: "LABOUR", labourerId: labourer.id });

    await expect(t.db.labourer.delete({ where: { id: labourer.id } })).rejects.toThrow();
    expect(await t.db.expense.count({ where: { labourerId: labourer.id } })).toBe(1);
  });
});
