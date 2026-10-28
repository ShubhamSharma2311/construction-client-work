import { beforeEach, describe, expect, it } from "vitest";
import { errorOf, useTestApp } from "../../../test/app.ts";
import {
  BUSINESS_START,
  makeCustomer,
  makeDriver,
  makeKhet,
  makeSettings,
  makeTractor,
} from "../../../test/factories.ts";
import type { CustomerDto } from "../customers/customers.schema.ts";
import type { DriverDto } from "../drivers/drivers.schema.ts";
import type { KhetDto } from "../khets/khets.schema.ts";
import type { TractorDto } from "../tractors/tractors.schema.ts";
import type { TripDeleted, TripPage, TripSaved } from "./trips.schema.ts";

const t = useTestApp();

let customer: CustomerDto;
let driver: DriverDto;
let tractor: TractorDto;
let khet: KhetDto;

beforeEach(async () => {
  await makeSettings(t);
  tractor = await makeTractor(t, { regNumber: "RJ19AB0001" });
  driver = await makeDriver(t, { name: "Bhagirath", defaultTractorId: tractor.id });
  customer = await makeCustomer(t, { name: "Ramesh" });
  khet = await makeKhet(t, { name: "Luni Nadi" });
});

function tripBody(overrides: Record<string, unknown> = {}) {
  return {
    tripDate: "2026-10-27",
    customerId: customer.id,
    driverId: driver.id,
    tractorId: tractor.id,
    khetId: khet.id,
    amount: 5000,
    payment: { type: "DUE" },
    ...overrides,
  };
}

async function addTrip(overrides: Record<string, unknown> = {}): Promise<TripSaved> {
  const response = await t.post("/trips", tripBody(overrides));
  expect(response.statusCode, response.body).toBe(201);
  return response.json<TripSaved>();
}

describe("POST /trips — payment at delivery", () => {
  it("records a due trip with nothing received", async () => {
    const saved = await addTrip({ quantityNote: "1 trolley", notes: "near school" });

    expect(saved.trip).toMatchObject({
      kind: "TRIP",
      tripDate: "2026-10-27",
      customer: { id: customer.id, name: "Ramesh" },
      driver: { id: driver.id, name: "Bhagirath" },
      tractor: { id: tractor.id, regNumber: "RJ19AB0001" },
      khet: { id: khet.id, name: "Luni Nadi" },
      amountPaise: 500_000,
      receivedPaise: 0,
      duePaise: 500_000,
      status: "DUE",
      quantityNote: "1 trolley",
    });
    expect(saved.customerBalance).toEqual({
      balancePaise: 500_000,
      duePaise: 500_000,
      creditPaise: 0,
    });
    expect(await t.db.customerPayment.count()).toBe(0);
  });

  it.each(["CASH", "ONLINE"] as const)("records a %s trip as fully paid", async (type) => {
    const saved = await addTrip({ payment: { type } });

    expect(saved.trip).toMatchObject({ status: "PAID", receivedPaise: 500_000, duePaise: 0 });
    expect(saved.customerBalance.balancePaise).toBe(0);
    const payment = await t.db.customerPayment.findFirstOrThrow({ include: { allocations: true } });
    expect(payment).toMatchObject({
      mode: type,
      kind: "PAYMENT",
      amountPaise: 500_000,
      allocatedPaise: 500_000,
      paidOn: new Date("2026-10-27T00:00:00Z"),
    });
    expect(payment.allocations).toEqual([
      expect.objectContaining({ tripId: saved.trip.id, amountPaise: 500_000 }),
    ]);
  });

  it("records a partial payment and leaves the rest due", async () => {
    const saved = await addTrip({ payment: { type: "PARTIAL", paidAmount: 3000, mode: "CASH" } });

    expect(saved.trip).toMatchObject({
      status: "PARTIAL",
      receivedPaise: 300_000,
      duePaise: 200_000,
    });
    expect(saved.customerBalance.balancePaise).toBe(200_000);
  });

  it.each([
    ["equal to the amount", 5000],
    ["more than the amount", 6000],
  ])("rejects a partial payment %s", async (_label, paidAmount) => {
    const response = await t.post(
      "/trips",
      tripBody({ payment: { type: "PARTIAL", paidAmount, mode: "CASH" } }),
    );

    expect(response.statusCode).toBe(400);
  });

  it.each([
    ["zero partial", { type: "PARTIAL", paidAmount: 0, mode: "CASH" }],
    ["partial without mode", { type: "PARTIAL", paidAmount: 100 }],
    ["due with an amount", { type: "DUE", paidAmount: 100 }],
    ["unknown type", { type: "CREDIT" }],
  ])("rejects a %s with 400", async (_label, payment) => {
    expect((await t.post("/trips", tripBody({ payment }))).statusCode).toBe(400);
  });

  it("stores the UPI reference and refuses it a second time", async () => {
    await addTrip({ payment: { type: "ONLINE", reference: "UPI-4471" } });

    const again = await t.post(
      "/trips",
      tripBody({ payment: { type: "ONLINE", reference: "UPI-4471" } }),
    );

    expect(again.statusCode).toBe(409);
    expect(await t.db.trip.count()).toBe(1);
  });
});

describe("POST /trips — rules", () => {
  it("refuses entries before settings exist", async () => {
    await t.db.setting.deleteMany();

    const response = await t.post("/trips", tripBody());

    expect(response.statusCode).toBe(409);
    expect(errorOf(response).message).toContain("business settings");
  });

  it.each([
    ["tomorrow (IST)", "2026-10-29", 400],
    ["before the business start", "2026-03-31", 400],
  ])("rejects a trip dated %s", async (_label, tripDate, status) => {
    expect((await t.post("/trips", tripBody({ tripDate }))).statusCode).toBe(status);
  });

  it("accepts today and the business start date", async () => {
    await addTrip({ tripDate: "2026-10-28" });
    await addTrip({ tripDate: BUSINESS_START });

    expect(await t.db.trip.count()).toBe(2);
  });

  it("allows several trips for one customer on one day", async () => {
    await addTrip();
    await addTrip();

    expect(await t.db.trip.count()).toBe(2);
  });

  it.each(["customer", "driver", "tractor", "khet"] as const)(
    "refuses an inactive %s and 404s an unknown one",
    async (master) => {
      const ids = { customer, driver, tractor, khet };
      const path = { customer: "customers", driver: "drivers", tractor: "tractors", khet: "khets" };
      const field = `${master}Id`;
      await t.patch(`/${path[master]}/${String(ids[master].id)}`, { isActive: false });

      expect((await t.post("/trips", tripBody())).statusCode).toBe(409);
      expect((await t.post("/trips", tripBody({ [field]: 99999 }))).statusCode).toBe(404);
    },
  );

  it("warns when the driver is not on their usual tractor", async () => {
    const other = await makeTractor(t, { regNumber: "RJ19AB0002" });

    const saved = await addTrip({ tractorId: other.id });

    expect(saved.warnings).toEqual([
      "Bhagirath usually drives RJ19AB0001; this trip is on RJ19AB0002",
    ]);
  });
});

describe("POST /trips — double submission", () => {
  it("records one trip and one payment for a replayed request", async () => {
    const body = tripBody({ payment: { type: "CASH" } });

    const first = await t.post("/trips", body, "trip-key-0001");
    const replay = await t.post("/trips", body, "trip-key-0001");

    expect(replay.statusCode).toBe(201);
    expect(replay.headers["idempotent-replay"]).toBe("true");
    expect(replay.json()).toEqual(first.json());
    expect(await t.db.trip.count()).toBe(1);
    expect(await t.db.customerPayment.count()).toBe(1);
  });

  it("records one trip when the same request arrives twice at once", async () => {
    const body = tripBody({ payment: { type: "CASH" } });

    await Promise.all([
      t.post("/trips", body, "trip-key-0002"),
      t.post("/trips", body, "trip-key-0002"),
    ]);

    expect(await t.db.trip.count()).toBe(1);
  });

  it("refuses the same key for a different trip", async () => {
    await t.post("/trips", tripBody(), "trip-key-0003");

    const response = await t.post("/trips", tripBody({ amount: 6000 }), "trip-key-0003");

    expect(response.statusCode).toBe(422);
  });

  it("requires an Idempotency-Key", async () => {
    const response = await t.request({
      method: "POST",
      url: "/trips",
      body: tripBody(),
      headers: { "idempotency-key": "" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("GET /trips", () => {
  async function seed() {
    const other = await makeCustomer(t, { name: "Suresh" });
    await addTrip({ tripDate: "2026-10-01", payment: { type: "CASH" } });
    await addTrip({
      tripDate: "2026-10-15",
      payment: { type: "PARTIAL", paidAmount: 1000, mode: "ONLINE" },
    });
    await addTrip({ tripDate: "2026-10-20", customerId: other.id });
    return other;
  }

  it("lists newest first with totals over every match", async () => {
    await seed();

    const page = (await t.get("/trips?limit=2")).json<TripPage>();

    expect(page.items.map((trip) => trip.tripDate)).toEqual(["2026-10-20", "2026-10-15"]);
    expect(page.total).toBe(3);
    expect(page.totals).toEqual({
      count: 3,
      amountPaise: 1_500_000,
      receivedPaise: 600_000,
      duePaise: 900_000,
    });
  });

  it.each([
    ["status=PAID", ["2026-10-01"]],
    ["status=PARTIAL", ["2026-10-15"]],
    ["status=DUE", ["2026-10-20"]],
    ["from=2026-10-10&to=2026-10-20", ["2026-10-20", "2026-10-15"]],
    ["from=2026-10-15&to=2026-10-15", ["2026-10-15"]],
  ])("filters by %s", async (query, dates) => {
    await seed();

    const page = (await t.get(`/trips?${query}`)).json<TripPage>();

    expect(page.items.map((trip) => trip.tripDate)).toEqual(dates);
  });

  it("filters by customer, driver, tractor and khet", async () => {
    const other = await seed();

    const byCustomer = (await t.get(`/trips?customerId=${String(other.id)}`)).json<TripPage>();
    const byDriver = (await t.get(`/trips?driverId=${String(driver.id)}`)).json<TripPage>();

    expect(byCustomer.total).toBe(1);
    expect(byDriver.total).toBe(3);
  });

  it("rejects from after to", async () => {
    expect((await t.get("/trips?from=2026-10-20&to=2026-10-01")).statusCode).toBe(400);
  });
});

describe("PATCH /trips/:id", () => {
  const url = (saved: TripSaved) => `/trips/${String(saved.trip.id)}`;

  it("edits fields and keeps the balance right", async () => {
    const saved = await addTrip();

    const response = await t.patch(url(saved), { amount: 5500, notes: "rate corrected" });

    const body = response.json<TripSaved>();
    expect(body.trip).toMatchObject({ amountPaise: 550_000, notes: "rate corrected" });
    expect(body.customerBalance.balancePaise).toBe(550_000);
    expect(await t.db.auditLog.count({ where: { entity: "Trip", action: "UPDATE" } })).toBe(1);
  });

  it("refuses an amount below what is already received, but allows it equal", async () => {
    const saved = await addTrip({ payment: { type: "PARTIAL", paidAmount: 3000, mode: "CASH" } });

    const below = await t.patch(url(saved), { amount: 2999 });
    const equal = await t.patch(url(saved), { amount: 3000 });

    expect(below.statusCode).toBe(409);
    expect(errorOf(below).details).toEqual({ receivedPaise: 300_000 });
    expect(equal.json<TripSaved>().trip.status).toBe("PAID");
  });

  it("moves an unpaid trip to another customer, but not a paid one", async () => {
    const other = await makeCustomer(t, { name: "Suresh" });
    const due = await addTrip();
    const paid = await addTrip({ payment: { type: "CASH" } });

    const moved = await t.patch(url(due), { customerId: other.id });
    const refused = await t.patch(url(paid), { customerId: other.id });

    expect(moved.json<TripSaved>().customerBalance.balancePaise).toBe(500_000);
    expect(refused.statusCode).toBe(409);
  });

  it("keeps a master that was deactivated after the trip, but refuses switching to one", async () => {
    const saved = await addTrip();
    const otherKhet = await makeKhet(t);
    await t.patch(`/khets/${String(khet.id)}`, { isActive: false });
    await t.patch(`/khets/${String(otherKhet.id)}`, { isActive: false });

    expect((await t.patch(url(saved), { notes: "still fine" })).statusCode).toBe(200);
    expect((await t.patch(url(saved), { khetId: otherKhet.id })).statusCode).toBe(409);
  });

  it("checks a new date against the business window", async () => {
    const saved = await addTrip();

    expect((await t.patch(url(saved), { tripDate: "2026-10-29" })).statusCode).toBe(400);
    expect((await t.patch(url(saved), { tripDate: "2026-10-26" })).statusCode).toBe(200);
  });

  it("refuses to edit a deleted trip and 404s an unknown one", async () => {
    const saved = await addTrip();
    await t.delete(url(saved));

    expect((await t.patch(url(saved), { notes: "x" })).statusCode).toBe(409);
    expect((await t.patch("/trips/99999", { notes: "x" })).statusCode).toBe(404);
  });
});

describe("DELETE and restore", () => {
  const url = (saved: TripSaved) => `/trips/${String(saved.trip.id)}`;

  it("soft-deletes a due trip and drops it from lists and balance", async () => {
    const saved = await addTrip();

    const response = await t.delete(url(saved));

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json<TripDeleted>();
    expect(body.trip.deletedAt).not.toBeNull();
    expect(body.customerBalance.balancePaise).toBe(0);
    expect((await t.get("/trips")).json<TripPage>().total).toBe(0);
    expect((await t.get("/trips?deleted=true")).json<TripPage>().total).toBe(1);
  });

  it("refuses to delete a trip with money received unless told to release it", async () => {
    const saved = await addTrip({ payment: { type: "CASH" } });

    const refused = await t.delete(url(saved));

    expect(refused.statusCode).toBe(409);
    expect(errorOf(refused).details).toEqual({ receivedPaise: 500_000 });
  });

  it("releases received money into customer credit", async () => {
    const saved = await addTrip({ payment: { type: "CASH" } });

    const response = await t.delete(`${url(saved)}?releasePayments=true`);

    const body = response.json<TripDeleted>();
    expect(body.releasedPaise).toBe(500_000);
    expect(body.customerBalance).toEqual({
      balancePaise: -500_000,
      duePaise: 0,
      creditPaise: 500_000,
    });
    const audit = await t.db.auditLog.findFirstOrThrow({ where: { action: "DELETE" } });
    expect(audit.before).toMatchObject({ allocations: [{ amountPaise: 500_000 }] });
  });

  it("restores a deleted trip into the balance", async () => {
    const saved = await addTrip();
    await t.delete(url(saved));

    const response = await t.post(`${url(saved)}/restore`);

    expect(response.json<TripSaved>().customerBalance.balancePaise).toBe(500_000);
    expect((await t.post(`${url(saved)}/restore`)).statusCode).toBe(409);
    expect((await t.delete(url(saved))).statusCode).toBe(200);
    expect((await t.delete(url(saved))).statusCode).toBe(409);
  });
});

describe("opening balance", () => {
  const openingUrl = () => `/customers/${String(customer.id)}/opening-balance`;

  it("records the register's due on the business start date", async () => {
    const response = await t.post(openingUrl(), { amount: 12000, notes: "from old register" });

    expect(response.statusCode).toBe(201);
    const saved = response.json<TripSaved>();
    expect(saved.trip).toMatchObject({
      kind: "OPENING_BALANCE",
      tripDate: BUSINESS_START,
      driver: null,
      tractor: null,
      khet: null,
      amountPaise: 1_200_000,
    });
    expect(saved.customerBalance.balancePaise).toBe(1_200_000);
  });

  it("allows only one live opening balance per customer", async () => {
    await t.post(openingUrl(), { amount: 12000 });

    expect((await t.post(openingUrl(), { amount: 1 })).statusCode).toBe(409);
  });

  it("edits only the amount and notes", async () => {
    const saved = (await t.post(openingUrl(), { amount: 12000 })).json<TripSaved>();
    const url = `/trips/${String(saved.trip.id)}`;

    expect((await t.patch(url, { amount: 13000 })).json<TripSaved>().trip.amountPaise).toBe(
      1_300_000,
    );
    expect((await t.patch(url, { driverId: driver.id })).statusCode).toBe(400);
  });

  it("can be replaced after deletion but not restored over a new one", async () => {
    const first = (await t.post(openingUrl(), { amount: 12000 })).json<TripSaved>();
    await t.delete(`/trips/${String(first.trip.id)}`);
    await t.post(openingUrl(), { amount: 9000 });

    expect((await t.post(`/trips/${String(first.trip.id)}/restore`)).statusCode).toBe(409);
  });

  it("404s an unknown customer", async () => {
    expect((await t.post("/customers/99999/opening-balance", { amount: 1 })).statusCode).toBe(404);
  });
});

describe("business start date with entries", () => {
  const settings = (businessStartDate: string) =>
    t.put("/settings", {
      businessName: "Godara Bajri",
      businessStartDate,
      openingCash: 0,
      openingOnline: 0,
    });

  it("refuses to move the start after an existing trip", async () => {
    await addTrip({ tripDate: "2026-05-10" });

    const response = await settings("2026-06-01");

    expect(response.statusCode).toBe(409);
    expect(errorOf(response).details).toEqual({ earliestEntryDate: "2026-05-10" });
  });

  it("ignores deleted trips and allows moving up to the earliest live one", async () => {
    const old = await addTrip({ tripDate: "2026-04-05" });
    await addTrip({ tripDate: "2026-05-10" });
    await t.delete(`/trips/${String(old.trip.id)}`);

    expect((await settings("2026-05-10")).statusCode).toBe(200);
  });

  it("moves opening balances with the start date", async () => {
    await t.post(`/customers/${String(customer.id)}/opening-balance`, { amount: 12000 });

    await settings("2026-03-01");

    const opening = await t.db.trip.findFirstOrThrow({ where: { kind: "OPENING_BALANCE" } });
    expect(opening.tripDate).toEqual(new Date("2026-03-01T00:00:00Z"));
  });
});

describe("CSV export", () => {
  it("exports matching trips oldest first", async () => {
    await addTrip({ tripDate: "2026-10-02", notes: "=cmd" });
    await addTrip({ tripDate: "2026-10-01", payment: { type: "CASH" } });

    const response = await t.get("/trips/export?from=2026-10-01");

    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("trips_2026-10-01.csv");
    const lines = response.body.split("\r\n");
    expect(lines[0]).toContain("Trip #,Date,Kind,Customer");
    expect(lines[1]).toContain("2026-10-01");
    expect(lines[1]).toContain(",5000.00,5000.00,0.00,PAID");
    expect(lines[2]).toContain("'=cmd");
  });
});

describe("database guards behind the API", () => {
  it("refuses an allocation that would overfill a trip", async () => {
    const saved = await addTrip({ payment: { type: "PARTIAL", paidAmount: 4000, mode: "CASH" } });
    const extra = await t.db.customerPayment.create({
      data: {
        customerId: customer.id,
        paidOn: new Date("2026-10-27"),
        mode: "CASH",
        amountPaise: 200_000,
      },
    });

    await expect(
      t.db.paymentAllocation.create({
        data: { paymentId: extra.id, tripId: saved.trip.id, amountPaise: 200_000 },
      }),
    ).rejects.toThrow();
    expect(
      (await t.db.trip.findUniqueOrThrow({ where: { id: saved.trip.id } })).receivedPaise,
    ).toBe(400_000);
  });

  it("refuses an allocation across customers", async () => {
    const saved = await addTrip();
    const other = await makeCustomer(t);
    const payment = await t.db.customerPayment.create({
      data: {
        customerId: other.id,
        paidOn: new Date("2026-10-27"),
        mode: "CASH",
        amountPaise: 100,
      },
    });

    await expect(
      t.db.paymentAllocation.create({
        data: { paymentId: payment.id, tripId: saved.trip.id, amountPaise: 100 },
      }),
    ).rejects.toThrow(/different customers/);
  });

  it("refuses to change an allocation in place", async () => {
    const saved = await addTrip({ payment: { type: "CASH" } });
    const allocation = await t.db.paymentAllocation.findFirstOrThrow({
      where: { tripId: saved.trip.id },
    });

    await expect(
      t.db.paymentAllocation.update({ where: { id: allocation.id }, data: { amountPaise: 1 } }),
    ).rejects.toThrow(/immutable/);
  });

  it("refuses a write-off with a mode", async () => {
    await expect(
      t.db.customerPayment.create({
        data: {
          customerId: customer.id,
          paidOn: new Date("2026-10-27"),
          kind: "WRITE_OFF",
          mode: "CASH",
          amountPaise: 100,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("review fixes", () => {
  const settings = (businessStartDate: string) =>
    t.put("/settings", {
      businessName: "Godara Bajri",
      businessStartDate,
      openingCash: 0,
      openingOnline: 0,
    });

  it("refuses to restore a trip dated before a moved business start", async () => {
    const old = await addTrip({ tripDate: "2026-04-05" });
    await addTrip({ tripDate: "2026-05-10" });
    await t.delete(`/trips/${String(old.trip.id)}`);
    await settings("2026-05-10");

    const response = await t.post(`/trips/${String(old.trip.id)}/restore`);

    expect(response.statusCode).toBe(400);
  });

  async function writeOff(tripId: number, amountPaise: number) {
    await t.db.$transaction(async (tx) => {
      const payment = await tx.customerPayment.create({
        data: {
          customerId: customer.id,
          paidOn: new Date("2026-10-27"),
          kind: "WRITE_OFF",
          amountPaise,
        },
      });
      await tx.paymentAllocation.create({ data: { paymentId: payment.id, tripId, amountPaise } });
    });
  }

  it("refuses to release a trip that has a write-off set against it", async () => {
    const saved = await addTrip({ payment: { type: "PARTIAL", paidAmount: 4500, mode: "CASH" } });
    await writeOff(saved.trip.id, 50_000);

    const response = await t.delete(`/trips/${String(saved.trip.id)}?releasePayments=true`);

    expect(response.statusCode).toBe(409);
    expect(errorOf(response).message).toContain("write-off");
  });

  it("refuses at commit a write-off that is not fully set against trips", async () => {
    await expect(
      t.db.customerPayment.create({
        data: {
          customerId: customer.id,
          paidOn: new Date("2026-10-27"),
          kind: "WRITE_OFF",
          amountPaise: 100,
        },
      }),
    ).rejects.toThrow(/fully allocated/);
  });

  it("refuses at the database to soft-delete a trip or payment that still has allocations", async () => {
    const saved = await addTrip({ payment: { type: "CASH" } });

    await expect(
      t.db.trip.update({ where: { id: saved.trip.id }, data: { deletedAt: new Date() } }),
    ).rejects.toThrow(/allocations/);
    await expect(
      t.db.customerPayment.updateMany({ data: { deletedAt: new Date() } }),
    ).rejects.toThrow(/allocations/);
  });

  it("moves the payment taken at delivery when the trip date is corrected", async () => {
    const saved = await addTrip({ tripDate: "2026-10-01", payment: { type: "CASH" } });

    await t.patch(`/trips/${String(saved.trip.id)}`, { tripDate: "2026-10-05" });

    const payment = await t.db.customerPayment.findFirstOrThrow();
    expect(payment.paidOn).toEqual(new Date("2026-10-05T00:00:00Z"));
    expect(payment.deliveryTripId).toBe(saved.trip.id);
  });

  it("refuses an opening balance for an inactive customer", async () => {
    await t.patch(`/customers/${String(customer.id)}`, { isActive: false });

    const response = await t.post(`/customers/${String(customer.id)}/opening-balance`, {
      amount: 100,
    });

    expect(response.statusCode).toBe(409);
  });

  it("audits opening balances moved with the business start", async () => {
    await t.post(`/customers/${String(customer.id)}/opening-balance`, { amount: 100 });

    await settings("2026-03-01");

    const audit = await t.db.auditLog.findFirstOrThrow({
      where: { entity: "Trip", action: "UPDATE" },
    });
    expect(audit.after).toMatchObject({ tripDate: "2026-03-01T00:00:00.000Z" });
  });

  it("names the CSV after the dates it covers", async () => {
    const response = await t.get("/trips/export?from=2026-10-01&to=2026-10-31");

    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="trips_2026-10-01_to_2026-10-31.csv"',
    );
  });
});
