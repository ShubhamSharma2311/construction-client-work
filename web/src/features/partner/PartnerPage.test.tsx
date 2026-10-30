import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, json } from "../../test/fake-api.ts";
import { PARTNER_LEDGER, PARTNER_SHARE, PARTNERS } from "../../test/fixtures.ts";
import { renderApp, signedInRoutes } from "../../test/render.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

type Handler = (request: Request) => Response | Promise<Response>;

function partnerApi(extra: Record<string, Handler> = {}) {
  const shareAsked: URL[] = [];
  const api = fakeApi({
    ...signedInRoutes,
    "GET /partners": () => json(PARTNERS),
    "GET /partners/1/ledger": () => json(PARTNER_LEDGER),
    "GET /partners/1/share": (request) => {
      shareAsked.push(new URL(request.url));
      return json(PARTNER_SHARE);
    },
    ...extra,
  });
  return { api, shareAsked };
}

describe("Partner", () => {
  it("opens the only partner's account with this month's share", async () => {
    const { api, shareAsked } = partnerApi();

    await renderApp(api, { path: "/partner" });

    expect(await screen.findByRole("heading", { name: "Manish" })).toBeInTheDocument();
    expect(
      await screen.findByText("₹12,000 of Manish's share is still to pay"),
    ).toBeInTheDocument();
    const parts = screen.getByLabelText("How the share is worked out");
    expect(parts).toHaveTextContent("Profit₹64,000");
    expect(parts).toHaveTextContent("50% share₹32,000");
    expect(shareAsked[0]?.searchParams.get("from")).toBe("2026-10-01");
    expect(
      screen.getByRole("heading", { name: "Paid to Manish, net: ₹20,000" }),
    ).toBeInTheDocument();
  });

  it("shows a share paid beyond what is due in red", async () => {
    const { api } = partnerApi({
      "GET /partners/1/share": () => json({ ...PARTNER_SHARE, balancePaise: -300000 }),
    });

    await renderApp(api, { path: "/partner" });

    const line = await screen.findByText("Manish has been paid ₹3,000 more than the share");
    expect(line.className).toMatch(/over/);
  });

  it("explains when no share is set, without asking for one", async () => {
    const { api, shareAsked } = partnerApi({
      "GET /partners": () =>
        json({ ...PARTNERS, items: [{ ...PARTNERS.items[0], sharePercent: null }] }),
    });

    await renderApp(api, { path: "/partner" });

    expect(await screen.findByText(/No share of profit is set for Manish/)).toBeInTheDocument();
    expect(shareAsked).toHaveLength(0);
  });

  it("undoes a payment after asking", async () => {
    let undone = false;
    const { api } = partnerApi({
      "DELETE /partner-txns/91": () => {
        undone = true;
        return json({ txn: {}, netPaidPaise: 0 });
      },
    });
    const { user } = await renderApp(api, { path: "/partner" });

    await user.click(await screen.findByRole("button", { name: "Undo ₹20,000 on 12 Oct" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Undo entry" }),
    );

    expect(await screen.findByText("Entry undone. Paid to Manish, net: ₹0.")).toBeInTheDocument();
    expect(undone).toBe(true);
  });

  it("lists partners when there is more than one, and adds one with a checked share", async () => {
    const sent: unknown[] = [];
    const two = {
      ...PARTNERS,
      items: [
        ...PARTNERS.items,
        { id: 2, name: "Ravi", sharePercent: null, notes: null, isActive: true },
      ],
    };
    const { api } = partnerApi({
      "GET /partners": () => json(two),
      "POST /partners": async (request) => {
        sent.push(await request.json());
        return json({ id: 3, name: "Kailash", sharePercent: 25, notes: null, isActive: true }, 201);
      },
    });
    const { user } = await renderApp(api, { path: "/partner" });

    const list = await screen.findByRole("list", { name: "Partners" });
    expect(within(list).getByRole("link", { name: /Ravi/ })).toHaveTextContent("Share not set");
    await user.click(screen.getByRole("button", { name: "Add partner" }));
    const sheet = screen.getByRole("dialog", { name: "Add partner" });
    await user.type(within(sheet).getByLabelText("Name"), "Kailash");
    await user.type(within(sheet).getByLabelText("Share of profit, in percent"), "250");
    await user.click(within(sheet).getByRole("button", { name: "Add partner" }));
    expect(within(sheet).getByText("A share is 0 to 100 percent")).toBeInTheDocument();
    await user.clear(within(sheet).getByLabelText("Share of profit, in percent"));
    await user.type(within(sheet).getByLabelText("Share of profit, in percent"), "25");
    await user.click(within(sheet).getByRole("button", { name: "Add partner" }));

    expect(await screen.findByText("Kailash added.")).toBeInTheDocument();
    expect(sent).toEqual([{ name: "Kailash", sharePercent: 25 }]);
  });
});

describe("Editing a partner", () => {
  it("sets the share and refuses one over 100 percent", async () => {
    const sent: unknown[] = [];
    const { api } = partnerApi({
      "PATCH /partners/1": async (request) => {
        sent.push(await request.json());
        return json({ ...PARTNERS.items[0], sharePercent: 40 });
      },
    });
    const { user } = await renderApp(api, { path: "/partner" });

    await user.click(await screen.findByRole("button", { name: "Edit details" }));
    const sheet = screen.getByRole("dialog", { name: "Edit details" });
    const share = within(sheet).getByLabelText("Share of profit, in percent");
    await user.clear(share);
    await user.type(share, "140");
    await user.click(within(sheet).getByRole("button", { name: "Save details" }));
    expect(within(sheet).getByText("A share is 0 to 100 percent")).toBeInTheDocument();
    await user.clear(share);
    await user.type(share, "40");
    await user.click(within(sheet).getByRole("button", { name: "Save details" }));

    expect(await screen.findByText("Details saved.")).toBeInTheDocument();
    expect(sent).toEqual([{ sharePercent: 40 }]);
  });
});

describe("Partner payment", () => {
  it("records money paid to the only partner, once per key", async () => {
    const sent: { body: unknown; key: string | null }[] = [];
    const { api } = partnerApi({
      "POST /partners/1/txns": async (request) => {
        sent.push({ body: await request.json(), key: request.headers.get("idempotency-key") });
        return json(
          {
            txn: { ...PARTNER_LEDGER.entries[0], id: 92, amountPaise: 500000 },
            netPaidPaise: 2500000,
          },
          201,
        );
      },
    });
    const { user, router } = await renderApp(api, { path: "/new/partner" });

    expect(await screen.findByLabelText("Partner")).toHaveValue("1");
    await user.click(screen.getByText("Received from Manish"));
    await user.type(screen.getByLabelText("Amount"), "5000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("₹5,000 received from Manish. Paid to Manish, net: ₹25,000."),
    ).toBeInTheDocument();
    expect(sent[0]?.body).toEqual({
      direction: "RECEIVED_FROM_PARTNER",
      txnDate: "2026-10-28",
      amount: "5000",
      mode: "CASH",
    });
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(router.state.location.pathname).toBe("/partner/1");
  });
});
