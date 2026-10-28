import { beforeEach, describe, expect, it } from "vitest";
import { useTestApp } from "../../../test/app.ts";
import { makePartner, makeSettings } from "../../../test/factories.ts";
import type { PartnerDto } from "../partners/partners.schema.ts";
import type { PartnerLedger, PartnerTxnPage, PartnerTxnSaved } from "./partner-account.schema.ts";

const t = useTestApp();
let manish: PartnerDto;

beforeEach(async () => {
  await makeSettings(t);
  manish = await makePartner(t, { name: "Manish", sharePercent: 50 });
});

function record(body: Record<string, unknown>, key?: string, partnerId = manish.id) {
  return t.post(
    `/partners/${String(partnerId)}/txns`,
    { direction: "PAID_TO_PARTNER", txnDate: "2026-10-10", amount: 10000, mode: "ONLINE", ...body },
    key,
  );
}

async function recorded(body: Record<string, unknown>): Promise<PartnerTxnSaved> {
  const response = await record(body);
  expect(response.statusCode, response.body).toBe(201);
  return response.json<PartnerTxnSaved>();
}

describe("money between the business and Manish", () => {
  it("records money paid to him and money he put back, keeping the net", async () => {
    const paid = await recorded({ amount: 10000, notes: "September share" });

    expect(paid.txn).toMatchObject({
      partner: { id: manish.id, name: "Manish" },
      direction: "PAID_TO_PARTNER",
      txnDate: "2026-10-10",
      amountPaise: 1_000_000,
      notes: "September share",
    });
    expect(paid.netPaidPaise).toBe(1_000_000);
    const back = await recorded({ direction: "RECEIVED_FROM_PARTNER", amount: 3000 });
    expect(back.netPaidPaise).toBe(700_000);
  });

  it.each([
    ["a future date", { txnDate: "2026-10-29" }],
    ["a date before the business start", { txnDate: "2026-03-31" }],
    ["zero", { amount: 0 }],
    ["an unknown direction", { direction: "LOAN" }],
    ["no mode", { mode: undefined }],
  ])("refuses %s", async (_label, body) => {
    expect((await record(body)).statusCode).toBe(400);
  });

  it("settles with a partner who has left and 404s an unknown one", async () => {
    await t.patch(`/partners/${String(manish.id)}`, { isActive: false });

    expect((await record({})).statusCode).toBe(201);
    expect((await record({}, undefined, 99999)).statusCode).toBe(404);
  });

  it("records one transaction for a replayed request", async () => {
    await record({}, "partner-key-001");
    const replay = await record({}, "partner-key-001");

    expect(replay.headers["idempotent-replay"]).toBe("true");
    expect(await t.db.partnerTxn.count()).toBe(1);
  });

  it("corrects and deletes a transaction, with an audit trail", async () => {
    const saved = await recorded({ amount: 10000 });
    const url = `/partner-txns/${String(saved.txn.id)}`;

    const fixed = (await t.patch(url, { amount: 12000, mode: "CASH" })).json<PartnerTxnSaved>();
    const removed = (await t.delete(url)).json<PartnerTxnSaved>();

    expect(fixed).toMatchObject({
      txn: { amountPaise: 1_200_000, mode: "CASH" },
      netPaidPaise: 1_200_000,
    });
    expect(removed.netPaidPaise).toBe(0);
    expect((await t.patch(url, { amount: 1 })).statusCode).toBe(409);
    expect((await t.delete(url)).statusCode).toBe(409);
    expect(await t.db.auditLog.count({ where: { entity: "PartnerTxn" } })).toBe(3);
  });

  it("refuses an unknown field and an empty edit", async () => {
    const saved = await recorded({});
    const url = `/partner-txns/${String(saved.txn.id)}`;

    expect((await t.patch(url, { partnerId: 2 })).statusCode).toBe(400);
    expect((await t.patch(url, {})).statusCode).toBe(400);
  });
});

describe("partner ledger", () => {
  it("shows each transaction with the running net and the totals", async () => {
    await recorded({ amount: 10000, txnDate: "2026-09-05" });
    await recorded({ direction: "RECEIVED_FROM_PARTNER", amount: 4000, txnDate: "2026-09-20" });
    await recorded({ amount: 6000, txnDate: "2026-10-05" });

    const ledger = (await t.get(`/partners/${String(manish.id)}/ledger`)).json<PartnerLedger>();

    expect(
      ledger.entries.map((entry) => [entry.date, entry.direction, entry.netPaidPaise]),
    ).toEqual([
      ["2026-09-05", "PAID_TO_PARTNER", 1_000_000],
      ["2026-09-20", "RECEIVED_FROM_PARTNER", 600_000],
      ["2026-10-05", "PAID_TO_PARTNER", 1_200_000],
    ]);
    expect(ledger.totals).toEqual({
      paidToPartnerPaise: 1_600_000,
      receivedFromPartnerPaise: 400_000,
      netPaidPaise: 1_200_000,
    });
    expect(ledger.closingNetPaidPaise).toBe(1_200_000);
  });

  it("carries the net into a date range", async () => {
    await recorded({ amount: 10000, txnDate: "2026-09-05" });
    await recorded({ amount: 6000, txnDate: "2026-10-05" });

    const ledger = (
      await t.get(`/partners/${String(manish.id)}/ledger?from=2026-10-01`)
    ).json<PartnerLedger>();

    expect(ledger).toMatchObject({
      openingNetPaidPaise: 1_000_000,
      closingNetPaidPaise: 1_600_000,
    });
    expect(ledger.totals.netPaidPaise).toBe(600_000);
    expect((await t.get("/partners/99999/ledger")).statusCode).toBe(404);
  });
});

describe("partner transaction list", () => {
  it("filters, totals and exports", async () => {
    await recorded({ amount: 10000 });
    await recorded({ direction: "RECEIVED_FROM_PARTNER", amount: 2500, mode: "CASH" });
    const other = await makePartner(t, { name: "Ravi" });
    await recorded({ amount: 999 });
    await record({ amount: 500 }, undefined, other.id);

    const forManish = (
      await t.get(`/partner-txns?partnerId=${String(manish.id)}`)
    ).json<PartnerTxnPage>();
    const cash = (await t.get("/partner-txns?mode=CASH")).json<PartnerTxnPage>();
    const csv = await t.get("/partner-txns/export?from=2026-10-01&to=2026-10-31");

    expect(forManish.totals).toEqual({
      paidToPartnerPaise: 1_099_900,
      receivedFromPartnerPaise: 250_000,
      netPaidPaise: 849_900,
    });
    expect(cash.total).toBe(1);
    expect(csv.headers["content-disposition"]).toContain(
      "partner_transactions_2026-10-01_to_2026-10-31.csv",
    );
    expect(csv.body).toContain("Ravi");
  });

  it("stops the business start moving past a partner transaction", async () => {
    await recorded({ txnDate: "2026-05-01" });

    const response = await t.put("/settings", {
      businessName: "Godara Bajri",
      businessStartDate: "2026-06-01",
      openingCash: 0,
      openingOnline: 0,
    });

    expect(response.statusCode).toBe(409);
  });
});

describe("review gaps", () => {
  it("recomputes the net when an edit flips the direction", async () => {
    const saved = await recorded({ amount: 1000 });

    const flipped = await t.patch(`/partner-txns/${String(saved.txn.id)}`, {
      direction: "RECEIVED_FROM_PARTNER",
    });

    expect(flipped.json<PartnerTxnSaved>().netPaidPaise).toBe(-100_000);
  });

  it.each([["2026-10-29"], ["2026-03-31"]])("refuses an edit dated %s", async (txnDate) => {
    const saved = await recorded({});

    expect((await t.patch(`/partner-txns/${String(saved.txn.id)}`, { txnDate })).statusCode).toBe(
      400,
    );
  });

  it("totals only what the filter shows", async () => {
    await recorded({ amount: 1000 });
    await recorded({ direction: "RECEIVED_FROM_PARTNER", amount: 400 });
    const gone = await recorded({ amount: 50 });
    await t.delete(`/partner-txns/${String(gone.txn.id)}`);

    const received = (
      await t.get("/partner-txns?direction=RECEIVED_FROM_PARTNER")
    ).json<PartnerTxnPage>();
    const deleted = (await t.get("/partner-txns?deleted=true")).json<PartnerTxnPage>();

    expect(received.totals).toEqual({
      paidToPartnerPaise: 0,
      receivedFromPartnerPaise: 40_000,
      netPaidPaise: -40_000,
    });
    expect(deleted.totals).toEqual({
      paidToPartnerPaise: 5_000,
      receivedFromPartnerPaise: 0,
      netPaidPaise: 5_000,
    });
  });
});
