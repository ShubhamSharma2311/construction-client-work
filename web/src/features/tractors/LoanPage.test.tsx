import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, json } from "../../test/fake-api.ts";
import { LOAN } from "../../test/fixtures.ts";
import { renderApp, signedInRoutes } from "../../test/render.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function loanApi(
  loan = LOAN,
  extra: Record<string, (request: Request) => Response | Promise<Response>> = {},
) {
  return fakeApi({
    ...signedInRoutes,
    "GET /loans/5": () => json(loan),
    "GET /loans": () => json([]),
    ...extra,
  });
}

describe("A loan", () => {
  it("shows the schedule month by month", async () => {
    await renderApp(loanApi(), { path: "/loans/5" });

    const table = await screen.findByRole("table", { name: "EMI schedule" });
    expect(within(table).getByRole("link", { name: "Aug 2026 EMI" })).toHaveAttribute(
      "href",
      "/expenses/70",
    );
    // An unpaid month opens nothing; Pay EMI above is how it is paid.
    expect(within(table).queryByRole("link", { name: /^Sept? 2026 EMI$/ })).not.toBeInTheDocument();
    expect(within(table).getAllByText("Overdue")).toHaveLength(2);
    expect(screen.getByText("EMI").nextElementSibling).toHaveTextContent(
      "₹18,200 on the 5th of each month",
    );
    // Once any EMI is paid the loan has history, which the API will not delete.
    expect(screen.queryByRole("button", { name: "Delete loan" })).not.toBeInTheDocument();
  });

  it("pays the oldest unpaid month by default, once per key", async () => {
    const sent: { body: unknown; key: string | null }[] = [];
    const api = loanApi(LOAN, {
      "POST /loans/5/emi": async (request) => {
        sent.push({ body: await request.json(), key: request.headers.get("idempotency-key") });
        // The API answers with the loan as it now stands: September paid, short of the EMI.
        const schedule = LOAN.schedule.map((line) =>
          line.month === "2026-09"
            ? {
                ...line,
                status: "PAID" as const,
                payment: {
                  expenseId: 71,
                  paidOn: "2026-10-28",
                  amountPaise: 1500000,
                  lateFeePaise: 0,
                },
              }
            : line,
        );
        return json({ loan: { ...LOAN, schedule }, expenseId: 71, warnings: [] }, 201);
      },
    });
    const { user } = await renderApp(api, { path: "/loans/5" });

    await user.click(await screen.findByRole("button", { name: "Pay EMI" }));
    const sheet = screen.getByRole("dialog", { name: "Pay EMI" });
    expect(within(sheet).getByLabelText("Month")).toHaveValue("2026-09");
    expect(within(sheet).getByLabelText("EMI paid")).toHaveValue("18200");
    await user.type(within(sheet).getByLabelText("Late fee (if any)"), "250");
    await user.click(within(sheet).getByRole("button", { name: "Save EMI payment" }));

    // The month's short name is the browser's own: "Sep" or "Sept" depending on the device.
    expect(await screen.findByText(/^Sept? 2026 EMI paid: ₹15,000\.$/)).toBeInTheDocument();
    expect(sent[0]?.body).toEqual({
      emiMonth: "2026-09",
      paidOn: "2026-10-28",
      amount: "18200",
      mode: "ONLINE",
      lateFee: "250",
    });
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("opens Pay EMI on the month the link names", async () => {
    await renderApp(loanApi(), { path: "/loans/5?pay=2026-10" });

    const sheet = await screen.findByRole("dialog", { name: "Pay EMI" });
    expect(within(sheet).getByLabelText("Month")).toHaveValue("2026-10");
  });

  it("undoes a paid month after asking", async () => {
    let undone = false;
    const api = loanApi(LOAN, {
      "DELETE /loans/5/payments/70": () => {
        undone = true;
        return json(LOAN);
      },
    });
    const { user } = await renderApp(api, { path: "/loans/5" });

    await user.click(await screen.findByText("Undo an EMI payment"));
    await user.click(screen.getByRole("button", { name: "Undo the Aug 2026 payment" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Undo payment" }),
    );

    expect(await screen.findByText("Aug 2026 EMI undone; it is due again.")).toBeInTheDocument();
    expect(undone).toBe(true);
  });

  it("closes the loan early with the amount the lender took", async () => {
    const sent: unknown[] = [];
    const api = loanApi(LOAN, {
      "POST /loans/5/foreclose": async (request) => {
        sent.push(await request.json());
        return json(
          {
            loan: {
              ...LOAN,
              closedOn: "2026-10-28",
              closedReason: "FORECLOSED",
              foreclosure: { expenseId: 72, paidOn: "2026-10-28", amountPaise: 3500000 },
            },
            expenseId: 72,
            warnings: [],
          },
          201,
        );
      },
    });
    const { user } = await renderApp(api, { path: "/loans/5" });

    await user.click(await screen.findByRole("button", { name: "Close loan early" }));
    const sheet = screen.getByRole("dialog");
    await user.type(within(sheet).getByLabelText("Amount paid to close it"), "35000");
    await user.click(within(sheet).getByRole("button", { name: "Close the loan" }));

    expect(await screen.findByText("Loan closed with ₹35,000.")).toBeInTheDocument();
    expect(sent).toEqual([{ closedOn: "2026-10-28", amount: "35000", mode: "ONLINE" }]);
  });

  it("offers delete only on a loan with no payments, and removes it", async () => {
    const fresh = {
      ...LOAN,
      schedule: LOAN.schedule.map((line) => ({
        ...line,
        status: "UPCOMING" as const,
        payment: null,
      })),
    };
    const api = loanApi(fresh, { "DELETE /loans/5": () => new Response(null, { status: 204 }) });
    const { user, router } = await renderApp(api, { path: "/loans/5" });

    await user.click(await screen.findByRole("button", { name: "Delete loan" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete loan" }),
    );

    expect(await screen.findByText("Loan deleted.")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/tractors/3");
  });

  it("says when a link names a month already paid, and shows the next one due", async () => {
    await renderApp(loanApi(), { path: "/loans/5?pay=2026-08" });

    const sheet = await screen.findByRole("dialog", { name: "Pay EMI" });
    expect(within(sheet).getByRole("alert")).toHaveTextContent(
      /Aug 2026 is already paid or not part of this loan/,
    );
    expect(within(sheet).getByLabelText("Month")).toHaveValue("2026-09");
  });

  it("undoes an early closure, which opens the loan again", async () => {
    let undone = false;
    const closed = {
      ...LOAN,
      closedOn: "2026-10-22",
      closedReason: "FORECLOSED" as const,
      foreclosure: { expenseId: 72, paidOn: "2026-10-22", amountPaise: 3500000 },
    };
    const api = loanApi(closed, {
      "DELETE /loans/5/payments/72": () => {
        undone = true;
        return json(LOAN);
      },
    });
    const { user } = await renderApp(api, { path: "/loans/5" });

    await user.click(await screen.findByRole("button", { name: "Undo closing" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Undo closing" }),
    );

    expect(
      await screen.findByText("Closing undone; the loan is running again."),
    ).toBeInTheDocument();
    expect(undone).toBe(true);
  });

  it("offers nothing to pay on a closed loan", async () => {
    await renderApp(loanApi({ ...LOAN, closedOn: "2026-10-01", closedReason: "PAID_OFF" }), {
      path: "/loans/5?pay=2026-09",
    });

    expect(await screen.findByText("Paid off")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay EMI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
