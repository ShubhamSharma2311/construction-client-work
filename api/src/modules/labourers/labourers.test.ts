import { describe, expect, it } from "vitest";
import { useTestApp } from "../../../test/app.ts";
import { makeLabourer } from "../../../test/factories.ts";
import type { Page } from "../../lib/listing.ts";
import type { LabourerDto } from "./labourers.schema.ts";

const t = useTestApp();

describe("labourers", () => {
  it("creates labourers who may share a contractor's phone", async () => {
    const first = await makeLabourer(t, { name: "Kanaram", phone: "9414012345" });
    const second = await makeLabourer(t, { name: "Bhanwar", phone: "9414012345" });

    expect(first).toMatchObject({ name: "Kanaram", phone: "9414012345", isActive: true });
    expect(second.phone).toBe("9414012345");
  });

  it("updates, deactivates, and lists by search", async () => {
    const labourer = await makeLabourer(t, { name: "Kanaram" });
    await makeLabourer(t, { name: "Bhanwar" });

    const updated = await t.patch(`/labourers/${String(labourer.id)}`, {
      notes: "Loads at Luni",
      isActive: false,
    });
    const active = (await t.get("/labourers")).json<Page<LabourerDto>>();
    const found = (await t.get("/labourers?search=kana&active=all")).json<Page<LabourerDto>>();

    expect(updated.json()).toMatchObject({ notes: "Loads at Luni", isActive: false });
    expect(active.items.map((item) => item.name)).toEqual(["Bhanwar"]);
    expect(found.items.map((item) => item.name)).toEqual(["Kanaram"]);
  });

  it("rejects a bad phone and 404s an unknown labourer", async () => {
    expect((await t.post("/labourers", { name: "X", phone: "123" })).statusCode).toBe(400);
    expect((await t.get("/labourers/999")).statusCode).toBe(404);
    expect((await t.patch("/labourers/999", { name: "x" })).statusCode).toBe(404);
  });
});

describe("labourer phone search", () => {
  it("does not match every phone on a stray digit, and understands +91", async () => {
    await makeLabourer(t, { name: "Kanaram", phone: "9414012345" });
    await makeLabourer(t, { name: "Ram 1" });

    const stray = (await t.get("/labourers?search=ram 1")).json<Page<LabourerDto>>();
    const prefixed = (await t.get("/labourers?search=%2B91 94140")).json<Page<LabourerDto>>();

    expect(stray.items.map((item) => item.name)).toEqual(["Ram 1"]);
    expect(prefixed.items.map((item) => item.name)).toEqual(["Kanaram"]);
  });
});
