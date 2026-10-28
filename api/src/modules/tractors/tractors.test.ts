import { describe, expect, it } from "vitest";
import { useTestApp } from "../../../test/app.ts";
import { makeDriver, makeTractor } from "../../../test/factories.ts";
import type { Page } from "../../lib/listing.ts";
import type { TractorDto, TractorUpdated } from "./tractors.schema.ts";

const t = useTestApp();

describe("tractors", () => {
  it("normalises the registration number", async () => {
    const tractor = await makeTractor(t, { regNumber: "rj 19 ab-1234", label: "Swaraj 744" });

    expect(tractor).toEqual({
      id: tractor.id,
      regNumber: "RJ19AB1234",
      label: "Swaraj 744",
      isActive: true,
      defaultDriver: null,
    });
  });

  it("refuses the same registration written differently", async () => {
    await makeTractor(t, { regNumber: "RJ19AB1234" });

    const response = await t.post("/tractors", { regNumber: "rj-19-ab-1234", label: "Again" });

    expect(response.statusCode).toBe(409);
  });

  it.each(["AB", "RJ19 AB 1234 5678", "RJ19@1234"])(
    "rejects registration %j",
    async (regNumber) => {
      expect((await t.post("/tractors", { regNumber, label: "X" })).statusCode).toBe(400);
    },
  );

  it("shows the driver who usually drives it", async () => {
    const tractor = await makeTractor(t);
    const driver = await makeDriver(t, { defaultTractorId: tractor.id });

    const response = await t.get(`/tractors/${String(tractor.id)}`);

    expect(response.json()).toMatchObject({ defaultDriver: { id: driver.id, name: driver.name } });
  });

  it("frees the driver's usual tractor when the tractor is deactivated", async () => {
    const tractor = await makeTractor(t);
    const driver = await makeDriver(t, { defaultTractorId: tractor.id });

    const response = await t.patch(`/tractors/${String(tractor.id)}`, { isActive: false });

    const body = response.json<TractorUpdated>();
    expect(body.tractor).toMatchObject({ isActive: false, defaultDriver: null });
    expect(body.warnings).toEqual([`${driver.name} no longer has a usual tractor`]);
    expect((await t.get(`/drivers/${String(driver.id)}`)).json()).toMatchObject({
      defaultTractor: null,
    });
  });

  it("renames and refuses a rename onto another tractor's number", async () => {
    await makeTractor(t, { regNumber: "RJ19AB0001" });
    const tractor = await makeTractor(t, { regNumber: "RJ19AB0002" });
    const url = `/tractors/${String(tractor.id)}`;

    expect((await t.patch(url, { regNumber: "RJ19AB0001" })).statusCode).toBe(409);
    expect((await t.patch(url, { label: "New name" })).json<TractorUpdated>().warnings).toEqual([]);
  });

  it("lists, searches and 404s", async () => {
    await makeTractor(t, { regNumber: "RJ19AB0001", label: "Swaraj" });
    await makeTractor(t, { regNumber: "RJ19CD0002", label: "Mahindra" });

    const all = (await t.get("/tractors")).json<Page<TractorDto>>();
    const found = (await t.get("/tractors?search=cd 0002")).json<Page<TractorDto>>();

    expect(all.total).toBe(2);
    expect(found.items.map((tractor) => tractor.label)).toEqual(["Mahindra"]);
    expect((await t.get("/tractors/999")).statusCode).toBe(404);
    expect((await t.patch("/tractors/999", { label: "x" })).statusCode).toBe(404);
  });
});
