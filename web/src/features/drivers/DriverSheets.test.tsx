import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, json } from "../../test/fake-api.ts";
import {
  DRIVER,
  DRIVER_LEDGER,
  DRIVER_PAYMENTS,
  DRIVERS,
  MONTH_SALARY,
  TRACTORS,
} from "../../test/fixtures.ts";
import { renderApp, signedInRoutes } from "../../test/render.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

type Handler = (request: Request) => Response | Promise<Response>;

const withOpening = {
  ...DRIVER_LEDGER,
  entries: [
    {
      date: "2026-04-01",
      type: "OPENING_BALANCE" as const,
      refId: 9,
      description: "Balance from the old register",
      month: null,
      note: null,
      mode: null,
      earnedPaise: -200000,
      paidPaise: 0,
      balancePaise: -200000,
    },
    ...DRIVER_LEDGER.entries,
  ],
};

function api(extra: Record<string, Handler> = {}) {
  const sent: { route: string; body: unknown }[] = [];
  const record =
    (route: string, answer: unknown, status = 200) =>
    async (request: Request) => {
      sent.push({ route, body: request.method === "DELETE" ? null : await request.json() });
      return json(answer, status);
    };
  const fake = fakeApi({
    ...signedInRoutes,
    "GET /drivers": () => json(DRIVERS),
    "GET /drivers/2": () =>
      json({
        ...DRIVER,
        salaryRates: [
          ...DRIVER.salaryRates,
          { id: 2, effectiveFrom: "2026-09", monthlyPaise: 1800000 },
        ],
      }),
    "GET /drivers/2/ledger": () => json(withOpening),
    "GET /drivers/2/salary": () => json(MONTH_SALARY),
    "GET /driver-payments": () => json(DRIVER_PAYMENTS),
    "GET /tractors": () => json(TRACTORS),
    "POST /drivers/2/bonus": record(
      "bonus",
      {
        payment: { ...DRIVER_PAYMENTS.items[0], type: "BONUS", amountPaise: 200000 },
        balancePaise: 1000000,
      },
      201,
    ),
    "POST /drivers/2/salary-rates": record("rate", DRIVER, 201),
    "DELETE /drivers/2/salary-rates/2": record("removeRate", DRIVER),
    "DELETE /drivers/2/opening-balance": record("removeOpening", {
      accrual: withOpening.entries[0],
      balancePaise: 1200000,
    }),
    "PATCH /drivers/2": record("edit", { driver: DRIVER, warnings: ["Suresh is owed ₹10,000"] }),
    ...extra,
  });
  return { fake, sent };
}

describe("driver sheets", () => {
  it("pays a bonus with its reason", async () => {
    const { fake, sent } = api();
    const { user } = await renderApp(fake, { path: "/drivers/2" });

    await user.click(await screen.findByRole("button", { name: "Bonus" }));
    const sheet = screen.getByRole("dialog", { name: "Bonus" });
    await user.type(within(sheet).getByLabelText("Bonus"), "2000");
    await user.type(within(sheet).getByLabelText("What it is for"), "Diwali");
    await user.click(within(sheet).getByRole("button", { name: "Pay bonus" }));

    expect(await screen.findByText("Bonus of ₹2,000 paid to Suresh.")).toBeInTheDocument();
    expect(sent).toEqual([
      {
        route: "bonus",
        body: { paidOn: "2026-10-28", amount: "2000", mode: "CASH", note: "Diwali" },
      },
    ]);
  });

  it("adds a new salary from a month, and removes one entered by mistake", async () => {
    const { fake, sent } = api();
    const { user } = await renderApp(fake, { path: "/drivers/2" });

    await user.click(await screen.findByRole("button", { name: "Salary" }));
    const sheet = screen.getByRole("dialog", { name: "Salary" });
    await user.click(
      within(sheet).getByRole("button", { name: /^Remove the salary from Sept? 2026$/ }),
    );
    await screen.findByText("Salary removed.");
    await user.selectOptions(within(sheet).getByLabelText("New salary from: month"), "11");
    await user.selectOptions(within(sheet).getByLabelText("New salary from: year"), "2026");
    await user.type(within(sheet).getByLabelText("Monthly salary"), "18000");
    await user.click(within(sheet).getByRole("button", { name: "Add new salary" }));

    expect(
      await screen.findByText("Suresh's salary is ₹18,000 from Nov 2026."),
    ).toBeInTheDocument();
    expect(sent).toEqual([
      { route: "removeRate", body: null },
      { route: "rate", body: { effectiveFrom: "2026-11", monthlySalary: "18000" } },
    ]);
  });

  it("removes an old register balance after asking", async () => {
    const { fake, sent } = api();
    const { user } = await renderApp(fake, { path: "/drivers/2" });

    await user.click(await screen.findByRole("button", { name: "Remove old balance" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Remove old balance" }),
    );

    expect(
      await screen.findByText("Old balance removed. You owe Suresh ₹12,000."),
    ).toBeInTheDocument();
    expect(sent).toEqual([{ route: "removeOpening", body: null }]);
  });

  it("names a tractor another driver uses, nudges about a leaving date, and passes on warnings", async () => {
    const { fake, sent } = api();
    const { user } = await renderApp(fake, { path: "/drivers/2" });

    await user.click(await screen.findByRole("button", { name: "Edit details" }));
    const sheet = screen.getByRole("dialog", { name: "Edit details" });
    expect(
      await within(sheet).findByRole("option", { name: "RJ 21 RB 1190 (Bhanwar's)" }),
    ).toBeInTheDocument();
    // jsdom cannot type a date key by key; the browser tests use the real picker.
    const left = within(sheet).getByLabelText("Left on (if left)");
    await user.type(left, "2026-10-20");
    expect(within(sheet).getByText(/Untick Active below/)).toBeInTheDocument();
    await user.click(within(sheet).getByLabelText(/Active/));
    await user.click(within(sheet).getByRole("button", { name: "Save details" }));

    expect(await screen.findByText("Suresh is owed ₹10,000")).toBeInTheDocument();
    expect(sent).toEqual([{ route: "edit", body: { leftOn: "2026-10-20", isActive: false } }]);
  });
});
