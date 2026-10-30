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

function driverApi(extra: Record<string, Handler> = {}) {
  return fakeApi({
    ...signedInRoutes,
    "GET /drivers": () => json(DRIVERS),
    "GET /drivers/2": () => json(DRIVER),
    "GET /drivers/5/ledger": () =>
      json({ ...DRIVER_LEDGER, driver: { id: 5, name: "Bhanwar" }, closingBalancePaise: -300000 }),
    "GET /drivers/2/ledger": () => json(DRIVER_LEDGER),
    "GET /drivers/2/salary": () => json(MONTH_SALARY),
    "GET /driver-payments": () => json(DRIVER_PAYMENTS),
    "GET /tractors": () => json(TRACTORS),
    ...extra,
  });
}

describe("Drivers", () => {
  it("says where each driver's account stands", async () => {
    await renderApp(driverApi(), { path: "/drivers" });

    const list = await screen.findByRole("list", { name: "Drivers" });
    await vi.waitFor(() => {
      expect(within(list).getByRole("link", { name: /Suresh/ })).toHaveTextContent(
        "You owe Suresh ₹10,000",
      );
    });
    expect(within(list).getByRole("link", { name: /Bhanwar/ })).toHaveTextContent(
      "Bhanwar has ₹3,000 in advance",
    );
  });

  it("adds a driver with a salary and opens them", async () => {
    const sent: unknown[] = [];
    const api = driverApi({
      "POST /drivers": async (request) => {
        sent.push(await request.json());
        return json(DRIVER, 201);
      },
    });
    const { user, router } = await renderApp(api, { path: "/drivers" });

    await user.click(await screen.findByRole("button", { name: "Add driver" }));
    const sheet = screen.getByRole("dialog", { name: "Add driver" });
    await user.type(within(sheet).getByLabelText("Name"), "Suresh");
    await user.type(within(sheet).getByLabelText("Monthly salary"), "15000");
    await screen.findByRole("option", { name: "RJ 21 RA 4412" });
    await user.selectOptions(within(sheet).getByLabelText("Usual tractor"), "RJ 21 RA 4412");
    await user.click(within(sheet).getByRole("button", { name: "Add driver" }));

    expect(await screen.findByText("Suresh added.")).toBeInTheDocument();
    expect(sent).toEqual([
      { name: "Suresh", joinedOn: "2026-10-28", monthlySalary: "15000", defaultTractorId: 3 },
    ]);
    expect(router.state.location.pathname).toBe("/drivers/2");
  });
});

describe("A driver", () => {
  it("shows the account month by month and line by line", async () => {
    await renderApp(driverApi(), { path: "/drivers/2" });

    expect(await screen.findByText("You owe Suresh ₹10,000")).toBeInTheDocument();
    const months = await screen.findByRole("table", { name: "Month by month" });
    expect(within(months).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("table", { name: "Every entry" })).toHaveTextContent(
      "Salary for Sep 2026",
    );
    expect(screen.getByRole("link", { name: "Pay Suresh" })).toHaveAttribute(
      "href",
      "/new/driver-payment?driver=2",
    );
  });

  it("closes a month at the salary worked out, sending no amount of its own", async () => {
    const sent: unknown[] = [];
    const api = driverApi({
      "POST /drivers/2/close-month": async (request) => {
        sent.push(await request.json());
        return json(
          {
            accrual: {
              id: 16,
              kind: "MONTH_SALARY",
              month: "2026-09",
              accruedOn: "2026-09-30",
              amountPaise: 1500000,
              note: null,
            },
            balancePaise: 2500000,
          },
          201,
        );
      },
    });
    const { user } = await renderApp(api, { path: "/drivers/2" });

    await user.click(await screen.findByRole("button", { name: "Close a month" }));
    const sheet = screen.getByRole("dialog", { name: "Close a month" });
    expect(
      await within(sheet).findByText(/30 of 30 days worked: works out to/),
    ).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: /^Close Sept? 2026$/ }));

    expect(await screen.findByText(/closed\. You owe Suresh ₹25,000\./)).toBeInTheDocument();
    expect(sent).toEqual([{ month: "2026-09" }]);
  });

  it("asks why when the month's salary is changed", async () => {
    const sent: unknown[] = [];
    const api = driverApi({
      "POST /drivers/2/close-month": async (request) => {
        sent.push(await request.json());
        return json(
          {
            accrual: {
              id: 16,
              kind: "MONTH_SALARY",
              month: "2026-09",
              accruedOn: "2026-09-30",
              amountPaise: 1400000,
              note: "2 days off",
            },
            balancePaise: 2400000,
          },
          201,
        );
      },
    });
    const { user } = await renderApp(api, { path: "/drivers/2" });
    await user.click(await screen.findByRole("button", { name: "Close a month" }));
    const sheet = screen.getByRole("dialog");
    const amount = await within(sheet).findByLabelText("Salary for the month");

    await user.clear(amount);
    await user.type(amount, "14000");
    const close = within(sheet).getByRole("button", { name: /^Close Sept? 2026$/ });
    expect(close).toBeDisabled();
    await user.type(within(sheet).getByLabelText("Why a different amount"), "2 days off");
    await user.click(close);

    await screen.findByText(/closed\./);
    expect(sent).toEqual([{ month: "2026-09", amount: "14000", note: "2 days off" }]);
  });

  it("reopens a month already closed", async () => {
    let reopened = false;
    const closed = {
      ...MONTH_SALARY,
      closed: {
        id: 16,
        kind: "MONTH_SALARY" as const,
        month: "2026-09",
        accruedOn: "2026-09-30",
        amountPaise: 1500000,
        note: null,
      },
    };
    const api = driverApi({
      "GET /drivers/2/salary": () => json(closed),
      "DELETE /drivers/2/close-month/2026-09": () => {
        reopened = true;
        return json({ accrual: closed.closed, balancePaise: -500000 });
      },
    });
    const { user } = await renderApp(api, { path: "/drivers/2" });

    await user.click(await screen.findByRole("button", { name: "Close a month" }));
    await user.click(
      await within(screen.getByRole("dialog")).findByRole("button", {
        name: /^Reopen Sept? 2026$/,
      }),
    );

    expect(
      await screen.findByText(/reopened\. Suresh has ₹5,000 in advance\./),
    ).toBeInTheDocument();
    expect(reopened).toBe(true);
  });

  it("enters an old balance the driver owed as a minus", async () => {
    const sent: unknown[] = [];
    const api = driverApi({
      "POST /drivers/2/opening-balance": async (request) => {
        sent.push(await request.json());
        return json(
          {
            accrual: {
              id: 17,
              kind: "OPENING_BALANCE",
              month: null,
              accruedOn: "2026-04-01",
              amountPaise: -200000,
              note: null,
            },
            balancePaise: 800000,
          },
          201,
        );
      },
    });
    const { user } = await renderApp(api, { path: "/drivers/2" });

    await user.click(await screen.findByRole("button", { name: "Old register balance" }));
    const sheet = screen.getByRole("dialog");
    await user.click(within(sheet).getByText("Suresh owed you"));
    await user.type(within(sheet).getByLabelText("Amount"), "2000");
    await user.click(within(sheet).getByRole("button", { name: "Add old balance" }));

    expect(await screen.findByText(/Old balance added/)).toBeInTheDocument();
    expect(sent).toEqual([{ amount: "-2000" }]);
  });

  it("undoes a payment after asking", async () => {
    let undone = false;
    const api = driverApi({
      "DELETE /driver-payments/31": () => {
        undone = true;
        return json({ payment: DRIVER_PAYMENTS.items[0], balancePaise: 1500000 });
      },
    });
    const { user } = await renderApp(api, { path: "/drivers/2" });

    await user.click(
      await screen.findByRole("button", { name: "Undo advance of ₹5,000 on 5 Oct" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Undo payment" }),
    );

    expect(await screen.findByText("Payment undone. You owe Suresh ₹15,000.")).toBeInTheDocument();
    expect(undone).toBe(true);
  });

  it("clears a phone with null when editing", async () => {
    const sent: unknown[] = [];
    const api = driverApi({
      "PATCH /drivers/2": async (request) => {
        sent.push(await request.json());
        return json({ driver: { ...DRIVER, phone: null }, warnings: [] });
      },
    });
    const { user } = await renderApp(api, { path: "/drivers/2" });

    await user.click(await screen.findByRole("button", { name: "Edit details" }));
    await user.clear(within(screen.getByRole("dialog")).getByLabelText("Phone"));
    await user.click(screen.getByRole("button", { name: "Save details" }));

    expect(await screen.findByText("Details saved.")).toBeInTheDocument();
    expect(sent).toEqual([{ phone: null }]);
  });
});
