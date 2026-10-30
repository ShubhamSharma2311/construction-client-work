import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, json } from "../../test/fake-api.ts";
import {
  DRIVER,
  DRIVER_LEDGER,
  DRIVER_PAYMENTS,
  DRIVERS,
  MONTH_SALARY,
} from "../../test/fixtures.ts";
import { renderApp, signedInRoutes } from "../../test/render.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function paymentApi() {
  const sent: { route: string; body: unknown; key: string | null }[] = [];
  const answer = async (route: string, request: Request) => {
    sent.push({ route, body: await request.json(), key: request.headers.get("idempotency-key") });
    return json({ payment: DRIVER_PAYMENTS.items[0], balancePaise: 500000 }, 201);
  };
  const api = fakeApi({
    ...signedInRoutes,
    "GET /drivers": () => json(DRIVERS),
    "GET /drivers/2": () => json(DRIVER),
    "GET /drivers/2/ledger": () => json(DRIVER_LEDGER),
    "GET /drivers/2/salary": () => json(MONTH_SALARY),
    "GET /driver-payments": () => json(DRIVER_PAYMENTS),
    "POST /drivers/2/payments": (request) => answer("payments", request),
    "POST /drivers/2/bonus": (request) => answer("bonus", request),
  });
  return { api, sent };
}

describe("Driver payment", () => {
  it("pays an advance to the driver the link names, then opens their page", async () => {
    const { api, sent } = paymentApi();
    const { user, router } = await renderApp(api, { path: "/new/driver-payment?driver=2" });

    await screen.findByRole("option", { name: "Suresh" });
    expect(screen.getByLabelText("Driver")).toHaveValue("2");
    await user.type(screen.getByLabelText("Amount"), "5000");
    await user.click(screen.getByRole("button", { name: "Save payment" }));

    expect(await screen.findByText("₹5,000 paid. You owe Suresh ₹5,000.")).toBeInTheDocument();
    expect(sent).toEqual([
      {
        route: "payments",
        body: { type: "ADVANCE", paidOn: "2026-10-28", amount: "5000", mode: "CASH" },
        key: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
      },
    ]);
    expect(router.state.location.pathname).toBe("/drivers/2");
  });

  it("pays salary for a month", async () => {
    const { api, sent } = paymentApi();
    const { user } = await renderApp(api, { path: "/new/driver-payment?driver=2" });
    await screen.findByRole("option", { name: "Suresh" });

    await user.click(screen.getByText("Salary"));
    await user.type(screen.getByLabelText("Amount"), "15000");
    await user.selectOptions(screen.getByLabelText("Salary for (if one month): month"), "09");
    await user.selectOptions(screen.getByLabelText("Salary for (if one month): year"), "2026");
    await user.click(screen.getByRole("button", { name: "Save payment" }));

    await screen.findByText(/paid\./);
    expect(sent[0]?.body).toEqual({
      type: "SALARY",
      paidOn: "2026-10-28",
      amount: "15000",
      mode: "CASH",
      forMonth: "2026-09",
    });
  });

  it("sends a bonus to the bonus entry, and needs its reason", async () => {
    const { api, sent } = paymentApi();
    const { user } = await renderApp(api, { path: "/new/driver-payment?driver=2" });
    await screen.findByRole("option", { name: "Suresh" });

    await user.click(screen.getByText("Bonus"));
    await user.type(screen.getByLabelText("Amount"), "2000");
    await user.click(screen.getByRole("button", { name: "Save payment" }));
    expect(screen.getByText("Say what the bonus is for")).toBeInTheDocument();
    await user.type(screen.getByLabelText("What it is for"), "Diwali");
    await user.click(screen.getByRole("button", { name: "Save payment" }));

    await screen.findByText(/paid\./);
    expect(sent).toEqual([
      {
        route: "bonus",
        body: { paidOn: "2026-10-28", amount: "2000", mode: "CASH", note: "Diwali" },
        key: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
      },
    ]);
  });

  it("asks for the driver when none is chosen", async () => {
    const { api, sent } = paymentApi();
    const { user } = await renderApp(api, { path: "/new/driver-payment" });

    await user.type(await screen.findByLabelText("Amount"), "5000");
    await user.click(screen.getByRole("button", { name: "Save payment" }));

    expect(screen.getByText("Pick the driver")).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });
});
