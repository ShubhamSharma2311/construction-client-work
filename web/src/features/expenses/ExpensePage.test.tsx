import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, json } from "../../test/fake-api.ts";
import { DRIVERS, EXPENSE, expensePage, LABOURERS, TRACTORS } from "../../test/fixtures.ts";
import { renderApp, signedInRoutes } from "../../test/render.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function expenseApi(
  expense = EXPENSE,
  extra: Record<string, (request: Request) => Response | Promise<Response>> = {},
) {
  return fakeApi({
    ...signedInRoutes,
    "GET /expenses/61": () => json(expense),
    "GET /expenses": () => json(expensePage([])),
    "GET /tractors": () => json(TRACTORS),
    "GET /drivers": () => json(DRIVERS),
    "GET /labourers": () => json(LABOURERS),
    ...extra,
  });
}

describe("An expense", () => {
  it("shows its details and deletes after asking", async () => {
    const api = expenseApi(EXPENSE, {
      "DELETE /expenses/61": () => json({ ...EXPENSE, deletedAt: "2026-10-28T07:00:00Z" }),
    });
    const { user, router } = await renderApp(api, { path: "/expenses/61" });

    expect(await screen.findByText("Litres")).toBeInTheDocument();
    expect(screen.getByText("Litres").nextElementSibling).toHaveTextContent("47.5 L");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete expense" }),
    );

    expect(await screen.findByText("Diesel of ₹4,500 deleted.")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/expenses");
  });

  it("restores a deleted expense", async () => {
    let restored = false;
    const api = expenseApi(
      { ...EXPENSE, deletedAt: "2026-10-28T07:00:00Z" },
      {
        "POST /expenses/61/restore": () => {
          restored = true;
          return json(EXPENSE);
        },
      },
    );
    const { user } = await renderApp(api, { path: "/expenses/61" });

    expect(await screen.findByText("Deleted")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore expense" }));

    expect(await screen.findByText("Expense restored.")).toBeInTheDocument();
    expect(restored).toBe(true);
  });

  it("sends an EMI to its loan instead of offering edit or delete", async () => {
    const emi = {
      ...EXPENSE,
      category: "TRACTOR_EMI" as const,
      dieselLitres: null,
      driver: null,
      emiMonth: "2026-10",
      tractorLoanId: 5,
    };

    await renderApp(expenseApi(emi), { path: "/expenses/61" });

    expect(await screen.findByText("EMI for")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Tractors" })).toHaveAttribute(
      "href",
      "/tractors",
    );
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("edits only what changed", async () => {
    const sent: unknown[] = [];
    const api = expenseApi(EXPENSE, {
      "PATCH /expenses/61": async (request) => {
        sent.push(await request.json());
        return json({ expense: EXPENSE, warnings: [] });
      },
    });
    const { user, router } = await renderApp(api, { path: "/expenses/61/edit" });

    const litres = await screen.findByLabelText("Litres");
    await user.clear(litres);
    await user.type(litres, "50");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Expense updated.")).toBeInTheDocument();
    expect(sent).toEqual([{ litres: "50" }]);
    expect(router.state.location.pathname).toBe("/expenses/61");
  });
});
