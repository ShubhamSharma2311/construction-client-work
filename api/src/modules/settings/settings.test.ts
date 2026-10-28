import { describe, expect, it } from "vitest";
import { errorOf, useTestApp } from "../../../test/app.ts";
import { getBusinessBounds } from "./settings.service.ts";

const t = useTestApp();

const valid = {
  businessName: "  Godara   Bajri Supply ",
  businessStartDate: "2026-04-01",
  openingCash: "15000",
  openingOnline: 0,
};

describe("business settings", () => {
  it("is 404 until set up", async () => {
    const response = await t.get("/settings");

    expect(response.statusCode).toBe(404);
    expect(errorOf(response).message).toContain("not set up");
  });

  it("saves and returns the settings, recording an audit entry", async () => {
    const saved = await t.put("/settings", valid);

    expect(saved.statusCode).toBe(200);
    const expected = {
      businessName: "Godara Bajri Supply",
      businessStartDate: "2026-04-01",
      openingCashPaise: 1_500_000,
      openingOnlinePaise: 0,
    };
    expect(saved.json()).toEqual(expected);
    expect((await t.get("/settings")).json()).toEqual(expected);
    expect(await t.db.auditLog.findFirst({ where: { entity: "Setting" } })).toMatchObject({
      action: "CREATE",
    });
  });

  it("updates in place and audits the old values", async () => {
    await t.put("/settings", valid);

    await t.put("/settings", { ...valid, openingCash: "20000" });

    expect(await t.db.setting.count()).toBe(1);
    const audit = await t.db.auditLog.findFirstOrThrow({
      where: { entity: "Setting", action: "UPDATE" },
    });
    expect(audit.before).toMatchObject({ openingCashPaise: 1_500_000 });
    expect(audit.after).toMatchObject({ openingCashPaise: 2_000_000 });
  });

  it("rejects a start date in the future (IST)", async () => {
    const response = await t.put("/settings", { ...valid, businessStartDate: "2026-10-29" });

    expect(response.statusCode).toBe(400);
  });

  it("accepts today as the start date", async () => {
    expect(
      (await t.put("/settings", { ...valid, businessStartDate: "2026-10-28" })).statusCode,
    ).toBe(200);
  });

  it.each([
    ["negative opening cash", { openingCash: "-1" }],
    ["missing business name", { businessName: "  " }],
    ["impossible date", { businessStartDate: "2026-02-30" }],
  ])("rejects %s with 400", async (_label, change) => {
    expect((await t.put("/settings", { ...valid, ...change })).statusCode).toBe(400);
  });
});

describe("getBusinessBounds", () => {
  it("refuses entries until settings exist", async () => {
    await expect(getBusinessBounds(t.db, t.now)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("returns the start date and today's IST date", async () => {
    await t.put("/settings", valid);
    t.setNow("2026-10-28T19:00:00Z");

    expect(await getBusinessBounds(t.db, t.now)).toEqual({
      businessStartDate: "2026-04-01",
      today: "2026-10-29",
    });
  });
});
