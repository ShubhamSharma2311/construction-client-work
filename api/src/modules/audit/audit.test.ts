import { describe, expect, it } from "vitest";
import { useTestApp } from "../../../test/app.ts";
import { makeCustomer } from "../../../test/factories.ts";
import type { Page } from "../../lib/listing.ts";
import type { AuditEntryDto } from "./audit.schema.ts";

const t = useTestApp();

describe("GET /audit", () => {
  it("shows one record's history, newest first", async () => {
    const customer = await makeCustomer(t, { name: "Ramesh" });
    await makeCustomer(t, { name: "Someone else" });
    await t.patch(`/customers/${String(customer.id)}`, { name: "Ramesh Jat" });

    const response = await t.get(`/audit?entity=Customer&entityId=${String(customer.id)}`);

    const page = response.json<Page<AuditEntryDto>>();
    expect(page.items.map((entry) => entry.action)).toEqual(["UPDATE", "CREATE"]);
    expect(page.items[0]).toMatchObject({
      entity: "Customer",
      entityId: String(customer.id),
      before: { name: "Ramesh" },
      after: { name: "Ramesh Jat" },
    });
    expect(page.items[1]?.before).toBeNull();
  });

  it("lists every change to one kind of record", async () => {
    await makeCustomer(t);
    await makeCustomer(t);

    const page = (await t.get("/audit?entity=Customer")).json<Page<AuditEntryDto>>();

    expect(page.total).toBe(2);
  });

  it("requires the entity", async () => {
    expect((await t.get("/audit")).statusCode).toBe(400);
  });
});
