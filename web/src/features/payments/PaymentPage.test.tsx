import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, json } from "../../test/fake-api.ts";
import { CUSTOMERS, DUES, LEDGER, PAYMENT, tripPage } from "../../test/fixtures.ts";
import { renderApp, signedInRoutes } from "../../test/render.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const balance = { balancePaise: 2450000, duePaise: 2450000, creditPaise: 0 };

function paymentApi(
  payment = PAYMENT,
  extra: Record<string, (request: Request) => Response | Promise<Response>> = {},
) {
  return fakeApi({
    ...signedInRoutes,
    "GET /payments/51": () => json(payment),
    "GET /customers/7": () => json(CUSTOMERS.items[0]),
    "GET /customers/7/ledger": () => json(LEDGER),
    "GET /dues": () => json(DUES),
    "GET /trips": () => json(tripPage([])),
    ...extra,
  });
}

describe("A payment", () => {
  it("shows where the money went", async () => {
    await renderApp(paymentApi(), { path: "/payments/51" });

    const paid = await screen.findByRole("list", { name: "What it paid" });
    expect(within(paid).getByRole("link", { name: /Old register balance/ })).toHaveAttribute(
      "href",
      "/trips/30",
    );
    expect(screen.getByText("Received as").nextElementSibling).toHaveTextContent("Cash");
  });

  it("deletes after saying the trips it paid become due again", async () => {
    const api = paymentApi(PAYMENT, {
      "DELETE /payments/51": () =>
        json({
          payment: { ...PAYMENT, deletedAt: "2026-10-28T07:00:00Z" },
          customerBalance: balance,
        }),
    });
    const { user, router } = await renderApp(api, { path: "/payments/51" });

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("The ₹6,000 it paid goes back onto those trips as due.");
    await user.click(within(dialog).getByRole("button", { name: "Delete entry" }));

    expect(
      await screen.findByText("Entry deleted. Ramesh Bishnoi now owes ₹24,500."),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/dues/7");
  });

  it("changes only what was edited", async () => {
    const sent: unknown[] = [];
    const api = paymentApi(PAYMENT, {
      "PATCH /payments/51": async (request) => {
        sent.push(await request.json());
        return json({
          payment: { ...PAYMENT, mode: "ONLINE", reference: "UTR9" },
          customerBalance: balance,
        });
      },
    });
    const { user } = await renderApp(api, { path: "/payments/51" });

    await user.click(await screen.findByRole("button", { name: "Edit details" }));
    const sheet = screen.getByRole("dialog", { name: "Edit details" });
    await user.click(within(sheet).getByText("Online"));
    await user.type(within(sheet).getByLabelText("UPI or bank reference"), "UTR9");
    await user.click(within(sheet).getByRole("button", { name: "Save details" }));

    expect(await screen.findByText("Details saved.")).toBeInTheDocument();
    expect(sent).toEqual([{ mode: "ONLINE", reference: "UTR9" }]);
  });

  it("removes the reference when online money is changed to cash", async () => {
    const sent: unknown[] = [];
    const online = { ...PAYMENT, mode: "ONLINE" as const, reference: "UTR9" };
    const api = paymentApi(online, {
      "PATCH /payments/51": async (request) => {
        sent.push(await request.json());
        return json({ payment: PAYMENT, customerBalance: balance });
      },
    });
    const { user } = await renderApp(api, { path: "/payments/51" });

    await user.click(await screen.findByRole("button", { name: "Edit details" }));
    await user.click(within(screen.getByRole("dialog")).getByText("Cash"));
    await user.click(screen.getByRole("button", { name: "Save details" }));

    await screen.findByText("Details saved.");
    expect(sent).toEqual([{ mode: "CASH", reference: null }]);
  });

  it("keeps the date of money taken at delivery", async () => {
    const { user } = await renderApp(paymentApi({ ...PAYMENT, deliveryTripId: 41 }), {
      path: "/payments/51",
    });

    await user.click(await screen.findByRole("button", { name: "Edit details" }));

    const sheet = screen.getByRole("dialog", { name: "Edit details" });
    expect(
      within(sheet).getByText("Taken at delivery, so it keeps the trip's date."),
    ).toBeInTheDocument();
    expect(within(sheet).queryByLabelText("Date")).not.toBeInTheDocument();
  });
});
