import { describe, expect, it } from "vitest";
import { errorOf, useTestApp } from "../../../test/app.ts";
import type { Page } from "../../lib/listing.ts";
import type { CustomerCreated, CustomerDto } from "./customers.schema.ts";

const t = useTestApp();

async function create(body: Record<string, unknown>): Promise<CustomerCreated> {
  const response = await t.post("/customers", body);
  expect(response.statusCode).toBe(201);
  return response.json<CustomerCreated>();
}

describe("POST /customers", () => {
  it("creates a customer with a normalised phone and audits it", async () => {
    const { customer, possibleDuplicates } = await create({
      name: " Ramesh  Jat ",
      phone: "+91 98765 43210",
      village: "Bilara",
    });

    expect(customer).toMatchObject({
      name: "Ramesh Jat",
      phone: "9876543210",
      village: "Bilara",
      notes: null,
      isActive: true,
    });
    expect(possibleDuplicates).toEqual([]);
    expect(await t.db.auditLog.count({ where: { entity: "Customer", action: "CREATE" } })).toBe(1);
  });

  it("refuses a phone number another customer already has", async () => {
    const { customer } = await create({ name: "Ramesh", phone: "9876543210" });

    const response = await t.post("/customers", { name: "Suresh", phone: "09876543210" });

    expect(response.statusCode).toBe(409);
    expect(errorOf(response).details).toEqual({ customerId: customer.id });
  });

  it("allows two customers without a phone", async () => {
    await create({ name: "A" });
    await create({ name: "B", phone: null });

    expect(await t.db.customer.count()).toBe(2);
  });

  it("creates a same-name customer but lists the possible duplicates", async () => {
    const first = await create({ name: "Ram Lal", village: "Pipar" });

    const second = await create({ name: "  ram   LAL " });

    expect(second.possibleDuplicates.map((customer) => customer.id)).toEqual([first.customer.id]);
  });

  it.each([
    ["no name", { phone: "9876543210" }],
    ["blank name", { name: "   " }],
    ["bad phone", { name: "X", phone: "12345" }],
    ["long notes", { name: "X", notes: "n".repeat(501) }],
  ])("rejects %s with 400", async (_label, body) => {
    expect((await t.post("/customers", body)).statusCode).toBe(400);
  });
});

describe("GET /customers", () => {
  async function seed() {
    await create({ name: "Ramesh Jat", phone: "9876543210", village: "Bilara" });
    await create({ name: "Suresh", village: "Pipar City" });
    const { customer } = await create({ name: "Mahesh" });
    await t.patch(`/customers/${String(customer.id)}`, { isActive: false });
  }

  const names = (page: Page<CustomerDto>) => page.items.map((customer) => customer.name);

  it("lists active customers by name by default", async () => {
    await seed();

    const page = (await t.get("/customers")).json<Page<CustomerDto>>();

    expect(names(page)).toEqual(["Ramesh Jat", "Suresh"]);
    expect(page).toMatchObject({ total: 2, page: 1, limit: 50 });
  });

  it("filters inactive or all customers", async () => {
    await seed();

    expect(names((await t.get("/customers?active=false")).json())).toEqual(["Mahesh"]);
    expect((await t.get("/customers?active=all")).json<Page<CustomerDto>>().total).toBe(3);
  });

  it.each([
    ["name, any case", "RAMESH", ["Ramesh Jat"]],
    ["village", "pipar", ["Suresh"]],
    ["part of a phone", "98765", ["Ramesh Jat"]],
    ["nothing", "zzz", []],
  ])("searches by %s", async (_label, search, expected) => {
    await seed();

    const page = (await t.get(`/customers?search=${search}`)).json<Page<CustomerDto>>();

    expect(names(page)).toEqual(expected);
  });

  it("pages through results", async () => {
    for (const name of ["A", "B", "C"]) await create({ name });

    const page = (await t.get("/customers?page=2&limit=2")).json<Page<CustomerDto>>();

    expect(names(page)).toEqual(["C"]);
    expect(page.total).toBe(3);
  });
});

describe("GET and PATCH /customers/:id", () => {
  it("returns 404 for an unknown customer", async () => {
    const response = await t.get("/customers/999");

    expect(response.statusCode).toBe(404);
    expect(errorOf(response).message).toBe("Customer #999 not found");
  });

  it("updates fields, clears a field with null, and audits before and after", async () => {
    const { customer } = await create({ name: "Ramesh", phone: "9876543210", village: "Bilara" });

    const response = await t.patch(`/customers/${String(customer.id)}`, {
      name: "Ramesh Jat",
      village: null,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: "Ramesh Jat",
      village: null,
      phone: "9876543210",
    });
    const audit = await t.db.auditLog.findFirstOrThrow({ where: { action: "UPDATE" } });
    expect(audit.before).toMatchObject({ name: "Ramesh", village: "Bilara" });
    expect(audit.after).toMatchObject({ name: "Ramesh Jat", village: null });
  });

  it("deactivates and reactivates", async () => {
    const { customer } = await create({ name: "Ramesh" });
    const url = `/customers/${String(customer.id)}`;

    expect((await t.patch(url, { isActive: false })).json()).toMatchObject({ isActive: false });
    expect((await t.patch(url, { isActive: true })).json()).toMatchObject({ isActive: true });
  });

  it("refuses to take another customer's phone, but keeping your own is fine", async () => {
    await create({ name: "A", phone: "9876543210" });
    const { customer } = await create({ name: "B", phone: "9876543211" });
    const url = `/customers/${String(customer.id)}`;

    expect((await t.patch(url, { phone: "9876543210" })).statusCode).toBe(409);
    expect((await t.patch(url, { phone: "9876543211" })).statusCode).toBe(200);
  });

  it("rejects an empty patch", async () => {
    const { customer } = await create({ name: "A" });

    expect((await t.patch(`/customers/${String(customer.id)}`, {})).statusCode).toBe(400);
  });

  it("returns 404 when patching an unknown customer", async () => {
    expect((await t.patch("/customers/999", { name: "X" })).statusCode).toBe(404);
  });
});

describe("database backstop", () => {
  it("returns 409, not 500, when two customers race for one phone", async () => {
    const results = await Promise.all([
      t.post("/customers", { name: "A", phone: "9876543210" }),
      t.post("/customers", { name: "B", phone: "9876543210" }),
    ]);

    expect(results.map((response) => response.statusCode).sort()).toEqual([201, 409]);
  });
});
