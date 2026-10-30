import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ok } from "../../api/types.ts";
import { fakeApi, json } from "../../test/fake-api.ts";
import { CUSTOMERS, DUES, LEDGER, PAYMENT, TRIP, tripPage } from "../../test/fixtures.ts";
import { renderApp, signedInRoutes } from "../../test/render.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const older = { ...TRIP, id: 40, tripDate: "2026-10-20", duePaise: 150000 };
const newer = {
  ...TRIP,
  id: 41,
  tripDate: "2026-10-26",
  duePaise: 350000,
  status: "PARTIAL" as const,
};

function saved(
  over: Partial<Ok<"/payments/{id}", "get">> = {},
): Ok<"/customers/{id}/payments", "post"> {
  return {
    payment: { ...PAYMENT, ...over },
    customerBalance: { balancePaise: 1250000, duePaise: 1250000, creditPaise: 0 },
  };
}

function paymentApi(answer = () => json(saved(), 201)) {
  const sent: { body: unknown; key: string | null }[] = [];
  const api = fakeApi({
    ...signedInRoutes,
    "GET /customers/7": () => json(CUSTOMERS.items[0]),
    "GET /customers": () => json(CUSTOMERS),
    "GET /customers/7/ledger": () => json(LEDGER),
    "GET /dues": () => json(DUES),
    "GET /trips": (request) => {
      const status = new URL(request.url).searchParams.get("status");
      if (status === "DUE") return json(tripPage([older]));
      if (status === "PARTIAL") return json(tripPage([newer]));
      return json(tripPage([]));
    },
    "POST /customers/7/payments": async (request) => {
      sent.push({ body: await request.json(), key: request.headers.get("idempotency-key") });
      return answer();
    },
  });
  return { api, sent };
}

describe("Payment received", () => {
  it("records money against the oldest dues and opens the customer's account", async () => {
    const { api, sent } = paymentApi();
    const { user, router } = await renderApp(api, { path: "/new/payment?customer=7" });

    expect(await screen.findByText("Ramesh Bishnoi")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Amount received"), "6000");
    await user.click(screen.getByRole("button", { name: "Save payment" }));

    expect(
      await screen.findByText("Payment saved. Ramesh Bishnoi now owes ₹12,500."),
    ).toBeInTheDocument();
    expect(sent[0]?.body).toEqual({
      kind: "PAYMENT",
      mode: "CASH",
      paidOn: "2026-10-28",
      amount: "6000",
      allocation: { strategy: "AUTO" },
    });
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(router.state.location.pathname).toBe("/dues/7");
  });

  it("pays the trips ticked, in the order ticked, and says what is left as credit", async () => {
    const { api, sent } = paymentApi(() => json(saved({ unallocatedPaise: 50000 }), 201));
    const { user } = await renderApp(api, { path: "/new/payment?customer=7" });
    await user.type(await screen.findByLabelText("Amount received"), "4000");

    await user.click(screen.getByText("Choose trips"));
    const trips = await screen.findByRole("group", { name: "Tick the trips it pays, in order" });
    await user.click(within(trips).getByText("Trip on 26 Oct"));
    await user.click(within(trips).getByText("Trip on 20 Oct"));
    expect(within(trips).getByText("pays ₹3,500")).toBeInTheDocument();
    expect(within(trips).getByText("pays ₹500")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save payment" }));

    expect(await screen.findByText(/₹500 kept as credit/)).toBeInTheDocument();
    expect(sent[0]?.body).toMatchObject({
      allocation: {
        strategy: "MANUAL",
        items: [
          { tripId: 41, amount: "3500" },
          { tripId: 40, amount: "500" },
        ],
      },
    });
  });

  it("writes off with a reason and no cash or online mode", async () => {
    const { api, sent } = paymentApi(() => json(saved({ kind: "WRITE_OFF", mode: null }), 201));
    const { user } = await renderApp(api, { path: "/new/payment?customer=7&kind=writeoff" });

    expect(await screen.findByRole("heading", { name: "Write off" })).toBeInTheDocument();
    await user.type(await screen.findByLabelText("Amount written off"), "200");
    await user.click(screen.getByRole("button", { name: "Save write-off" }));
    expect(screen.getByText(/Say why it is written off/)).toBeInTheDocument();
    expect(screen.queryByText("Received as")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Reason"), "Discount agreed");
    await user.click(screen.getByRole("button", { name: "Save write-off" }));

    expect(await screen.findByText(/Write-off saved/)).toBeInTheDocument();
    expect(sent[0]?.body).toEqual({
      kind: "WRITE_OFF",
      paidOn: "2026-10-28",
      amount: "200",
      notes: "Discount agreed",
      allocation: { strategy: "AUTO" },
    });
  });

  it("lets the customer be picked when the entry starts from New entry", async () => {
    const { api } = paymentApi();
    const { user } = await renderApp(api, { path: "/new/payment" });

    await user.click(await screen.findByRole("combobox", { name: "Customer" }));
    await user.click(await screen.findByRole("option", { name: /Ramesh Bishnoi/ }));

    expect(screen.getByText("What it pays")).toBeInTheDocument();
  });
});
