import { describe, expect, it } from "vitest";
import { useTestApp } from "../../../test/app.ts";
import { makeKhet } from "../../../test/factories.ts";
import type { Page } from "../../lib/listing.ts";
import type { KhetDto } from "./khets.schema.ts";

const t = useTestApp();

describe("khets", () => {
  it("creates a khet and refuses the same name in another case or spacing", async () => {
    const khet = await makeKhet(t, { name: "Luni Nadi", location: "Near Bilara" });

    const duplicate = await t.post("/khets", { name: "  luni   NADI " });

    expect(khet).toMatchObject({ name: "Luni Nadi", location: "Near Bilara", isActive: true });
    expect(duplicate.statusCode).toBe(409);
  });

  it("renames, refuses a rename onto another khet, and allows a case-only rename", async () => {
    await makeKhet(t, { name: "Luni Nadi" });
    const khet = await makeKhet(t, { name: "Jojri" });
    const url = `/khets/${String(khet.id)}`;

    expect((await t.patch(url, { name: "LUNI nadi" })).statusCode).toBe(409);
    expect((await t.patch(url, { name: "JOJRI" })).json()).toMatchObject({ name: "JOJRI" });
  });

  it("deactivates and lists by filter and search", async () => {
    await makeKhet(t, { name: "Luni Nadi", location: "Bilara" });
    const old = await makeKhet(t, { name: "Jojri" });
    await t.patch(`/khets/${String(old.id)}`, { isActive: false });

    const active = (await t.get("/khets")).json<Page<KhetDto>>();
    const byLocation = (await t.get("/khets?search=bilara&active=all")).json<Page<KhetDto>>();

    expect(active.items.map((khet) => khet.name)).toEqual(["Luni Nadi"]);
    expect(byLocation.items.map((khet) => khet.name)).toEqual(["Luni Nadi"]);
  });

  it("404s an unknown khet", async () => {
    expect((await t.get("/khets/999")).statusCode).toBe(404);
    expect((await t.patch("/khets/999", { name: "x" })).statusCode).toBe(404);
  });
});
