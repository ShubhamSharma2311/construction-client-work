import { describe, expect, it } from "vitest";
import { errorOf, useTestApp } from "../../../test/app.ts";
import { makeDriver, makeTractor } from "../../../test/factories.ts";
import type { Page } from "../../lib/listing.ts";
import type { DriverDto, DriverUpdated } from "./drivers.schema.ts";

const t = useTestApp();

const url = (driver: DriverDto, suffix = "") => `/drivers/${String(driver.id)}${suffix}`;

describe("creating a driver", () => {
  it("starts the first salary rate in the joining month", async () => {
    const driver = await makeDriver(t, {
      name: "Bhagirath",
      phone: "98290 12345",
      joinedOn: "2026-04-15",
      monthlySalary: "15000",
    });

    expect(driver).toMatchObject({
      name: "Bhagirath",
      phone: "9829012345",
      joinedOn: "2026-04-15",
      leftOn: null,
      isActive: true,
      defaultTractor: null,
      currentMonthlyPaise: 1_500_000,
      salaryRates: [{ effectiveFrom: "2026-04", monthlyPaise: 1_500_000 }],
    });
  });

  it("rejects a joining date in the future", async () => {
    const response = await t.post("/drivers", {
      name: "X",
      joinedOn: "2026-10-29",
      monthlySalary: 1,
    });

    expect(response.statusCode).toBe(400);
  });

  it.each([
    ["no salary", { name: "X", joinedOn: "2026-04-01" }],
    ["zero salary", { name: "X", joinedOn: "2026-04-01", monthlySalary: 0 }],
    ["bad date", { name: "X", joinedOn: "2026-04-31", monthlySalary: 1 }],
  ])("rejects %s with 400", async (_label, body) => {
    expect((await t.post("/drivers", body)).statusCode).toBe(400);
  });

  it("assigns a usual tractor", async () => {
    const tractor = await makeTractor(t, { regNumber: "RJ19AB0001", label: "Swaraj" });

    const driver = await makeDriver(t, { defaultTractorId: tractor.id });

    expect(driver.defaultTractor).toEqual({
      id: tractor.id,
      regNumber: "RJ19AB0001",
      label: "Swaraj",
    });
  });

  it("refuses a tractor that is already another driver's usual tractor", async () => {
    const tractor = await makeTractor(t);
    const first = await makeDriver(t, { name: "Bhagirath", defaultTractorId: tractor.id });

    const response = await t.post("/drivers", {
      name: "Ramdev",
      joinedOn: "2026-04-01",
      monthlySalary: 1,
      defaultTractorId: tractor.id,
    });

    expect(response.statusCode).toBe(409);
    expect(errorOf(response).message).toContain(first.name);
  });

  it("refuses an inactive or unknown tractor", async () => {
    const tractor = await makeTractor(t);
    await t.patch(`/tractors/${String(tractor.id)}`, { isActive: false });
    const body = { name: "X", joinedOn: "2026-04-01", monthlySalary: 1 };

    expect((await t.post("/drivers", { ...body, defaultTractorId: tractor.id })).statusCode).toBe(
      409,
    );
    expect((await t.post("/drivers", { ...body, defaultTractorId: 999 })).statusCode).toBe(404);
  });
});

describe("updating a driver", () => {
  it("records a leaving date after the joining date", async () => {
    const driver = await makeDriver(t, { joinedOn: "2026-04-01" });

    const response = await t.patch(url(driver), { leftOn: "2026-09-30" });

    expect(response.json<DriverUpdated>().driver.leftOn).toBe("2026-09-30");
  });

  it.each([
    ["leaving before joining", { leftOn: "2026-03-31" }],
    ["leaving in the future", { leftOn: "2026-10-29" }],
    ["joining in the future", { joinedOn: "2026-10-29" }],
  ])("rejects %s with 400", async (_label, body) => {
    const driver = await makeDriver(t, { joinedOn: "2026-04-01" });

    expect((await t.patch(url(driver), body)).statusCode).toBe(400);
  });

  it("clears the leaving date with null", async () => {
    const driver = await makeDriver(t);
    await t.patch(url(driver), { leftOn: "2026-09-30" });

    const response = await t.patch(url(driver), { leftOn: null });

    expect(response.json<DriverUpdated>().driver.leftOn).toBeNull();
  });

  it("moves the first salary rate when the joining month is corrected", async () => {
    const driver = await makeDriver(t, { joinedOn: "2026-05-10" });

    const response = await t.patch(url(driver), { joinedOn: "2026-04-20" });

    expect(response.json<DriverUpdated>().driver.salaryRates[0]?.effectiveFrom).toBe("2026-04");
  });

  it("refuses a joining date past the driver's second rate", async () => {
    const driver = await makeDriver(t, { joinedOn: "2026-04-01" });
    await t.post(url(driver, "/salary-rates"), { effectiveFrom: "2026-07", monthlySalary: 16000 });

    expect((await t.patch(url(driver), { joinedOn: "2026-07-05" })).statusCode).toBe(409);
    expect((await t.patch(url(driver), { joinedOn: "2026-06-30" })).statusCode).toBe(200);
  });

  it("frees the usual tractor when the driver is deactivated", async () => {
    const tractor = await makeTractor(t);
    const driver = await makeDriver(t, { defaultTractorId: tractor.id });

    const response = await t.patch(url(driver), { isActive: false });

    const body = response.json<DriverUpdated>();
    expect(body.driver).toMatchObject({ isActive: false, defaultTractor: null });
    expect(body.warnings).toHaveLength(1);
    expect((await makeDriver(t, { defaultTractorId: tractor.id })).defaultTractor?.id).toBe(
      tractor.id,
    );
  });

  it("swaps a driver onto a free tractor and keeps their own when unchanged", async () => {
    const own = await makeTractor(t);
    const free = await makeTractor(t);
    const driver = await makeDriver(t, { defaultTractorId: own.id });

    expect((await t.patch(url(driver), { defaultTractorId: own.id })).statusCode).toBe(200);
    const moved = await t.patch(url(driver), { defaultTractorId: free.id });

    expect(moved.json<DriverUpdated>().driver.defaultTractor?.id).toBe(free.id);
  });

  it("returns 404 for an unknown driver", async () => {
    expect((await t.patch("/drivers/999", { name: "X" })).statusCode).toBe(404);
    expect((await t.get("/drivers/999")).statusCode).toBe(404);
  });
});

describe("salary rates", () => {
  it("uses the rate in effect this month as the current salary", async () => {
    const driver = await makeDriver(t, { joinedOn: "2026-04-01", monthlySalary: 15000 });
    await t.post(url(driver, "/salary-rates"), { effectiveFrom: "2026-09", monthlySalary: 16000 });

    const response = await t.post(url(driver, "/salary-rates"), {
      effectiveFrom: "2026-12",
      monthlySalary: 17000,
    });

    expect(response.statusCode).toBe(201);
    const updated = response.json<DriverDto>();
    expect(updated.currentMonthlyPaise).toBe(1_600_000);
    expect(updated.salaryRates.map((rate) => rate.effectiveFrom)).toEqual([
      "2026-04",
      "2026-09",
      "2026-12",
    ]);
  });

  it("refuses a rate before the joining month and a second rate for one month", async () => {
    const driver = await makeDriver(t, { joinedOn: "2026-04-15" });

    const early = await t.post(url(driver, "/salary-rates"), {
      effectiveFrom: "2026-03",
      monthlySalary: 1,
    });
    const twice = await t.post(url(driver, "/salary-rates"), {
      effectiveFrom: "2026-04",
      monthlySalary: 1,
    });

    expect(early.statusCode).toBe(409);
    expect(twice.statusCode).toBe(409);
  });

  it("deletes a later rate but never the first", async () => {
    const driver = await makeDriver(t);
    const withRate = (
      await t.post(url(driver, "/salary-rates"), { effectiveFrom: "2026-08", monthlySalary: 1 })
    ).json<DriverDto>();
    const [first, second] = withRate.salaryRates;

    expect((await t.delete(url(driver, `/salary-rates/${String(first?.id)}`))).statusCode).toBe(
      409,
    );
    const deleted = await t.delete(url(driver, `/salary-rates/${String(second?.id)}`));

    expect(deleted.json<DriverDto>().salaryRates).toHaveLength(1);
    expect(
      await t.db.auditLog.count({ where: { entity: "DriverSalaryRate", action: "DELETE" } }),
    ).toBe(1);
  });

  it("404s a rate that belongs to another driver", async () => {
    const owner = await makeDriver(t);
    const other = await makeDriver(t);
    const rateId = owner.salaryRates[0]?.id ?? 0;

    expect((await t.delete(url(other, `/salary-rates/${String(rateId)}`))).statusCode).toBe(404);
  });

  it("404s a rate for an unknown driver", async () => {
    const response = await t.post("/drivers/999/salary-rates", {
      effectiveFrom: "2026-05",
      monthlySalary: 1,
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("listing drivers", () => {
  it("lists active drivers by name and searches by name or phone", async () => {
    await makeDriver(t, { name: "Ramdev", phone: "9829012345" });
    await makeDriver(t, { name: "Bhagirath" });

    const all = (await t.get("/drivers")).json<Page<DriverDto>>();
    const byPhone = (await t.get("/drivers?search=98290")).json<Page<DriverDto>>();

    expect(all.items.map((driver) => driver.name)).toEqual(["Bhagirath", "Ramdev"]);
    expect(byPhone.items.map((driver) => driver.name)).toEqual(["Ramdev"]);
  });
});

describe("tractor rules for inactive drivers", () => {
  it("refuses a usual tractor for a driver who is inactive", async () => {
    const tractor = await makeTractor(t);
    const driver = await makeDriver(t);
    await t.patch(url(driver), { isActive: false });

    const response = await t.patch(url(driver), { defaultTractorId: tractor.id });

    expect(response.statusCode).toBe(409);
  });

  it("refuses a usual tractor in the same request that deactivates the driver", async () => {
    const tractor = await makeTractor(t);
    const driver = await makeDriver(t);

    const response = await t.patch(url(driver), { isActive: false, defaultTractorId: tractor.id });

    expect(response.statusCode).toBe(409);
  });

  it("never leaves an inactive tractor as a usual tractor when the two race", async () => {
    for (let round = 0; round < 8; round += 1) {
      const tractor = await makeTractor(t);
      const driver = await makeDriver(t);

      await Promise.all([
        t.patch(`/tractors/${String(tractor.id)}`, { isActive: false }),
        t.patch(url(driver), { defaultTractorId: tractor.id }),
      ]);

      const linked = await t.db.driver.findFirst({
        where: { defaultTractorId: tractor.id },
        include: { defaultTractor: true },
      });
      expect(linked?.defaultTractor?.isActive ?? true).toBe(true);
    }
  });
});

describe("ids beyond the database range", () => {
  it("answers 400, not 500", async () => {
    const driver = await makeDriver(t);

    expect((await t.get("/drivers/3000000000")).statusCode).toBe(400);
    expect((await t.patch(url(driver), { defaultTractorId: 3000000000 })).statusCode).toBe(400);
  });
});
