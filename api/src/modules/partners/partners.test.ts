import { describe, expect, it } from "vitest";
import { useTestApp } from "../../../test/app.ts";
import { makePartner } from "../../../test/factories.ts";
import type { Page } from "../../lib/listing.ts";
import type { PartnerDto } from "./partners.schema.ts";

const t = useTestApp();

describe("partners", () => {
  it("stores the share exactly, including two decimals", async () => {
    const partner = await makePartner(t, { name: "Manish", sharePercent: 33.33 });

    expect(partner).toMatchObject({ name: "Manish", sharePercent: 33.33 });
    expect(await t.db.partner.findUniqueOrThrow({ where: { id: partner.id } })).toMatchObject({
      shareBasisPoints: 3333,
    });
  });

  it("allows a partner whose share is not agreed yet", async () => {
    const partner = await makePartner(t, { sharePercent: null });

    expect(partner.sharePercent).toBeNull();
  });

  it.each([[-1], [100.01], [33.333]])("rejects share %d%% with 400", async (sharePercent) => {
    expect((await t.post("/partners", { name: "Manish", sharePercent })).statusCode).toBe(400);
  });

  it("accepts the edges 0% and 100%", async () => {
    expect((await makePartner(t, { sharePercent: 0 })).sharePercent).toBe(0);
    expect((await makePartner(t, { sharePercent: 100 })).sharePercent).toBe(100);
  });

  it("changes and clears the share, and lists partners", async () => {
    const partner = await makePartner(t, { sharePercent: 50 });
    const url = `/partners/${String(partner.id)}`;

    expect((await t.patch(url, { sharePercent: 40 })).json()).toMatchObject({ sharePercent: 40 });
    expect((await t.patch(url, { sharePercent: null })).json()).toMatchObject({
      sharePercent: null,
    });
    expect((await t.get("/partners?search=man")).json<Page<PartnerDto>>().total).toBe(1);
  });

  it("404s an unknown partner", async () => {
    expect((await t.get("/partners/999")).statusCode).toBe(404);
    expect((await t.patch("/partners/999", { name: "x" })).statusCode).toBe(404);
  });
});
