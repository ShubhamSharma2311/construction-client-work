import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fakeApi, json } from "../../test/fake-api.ts";
import { BALANCE_ROUTES, CUSTOMERS, DUES } from "../../test/fixtures.ts";
import { renderApp, signedInRoutes } from "../../test/render.tsx";

function duesApi(extra: Record<string, (request: Request) => Response | Promise<Response>> = {}) {
  return fakeApi({
    ...signedInRoutes,
    ...BALANCE_ROUTES,
    "GET /dues": () => json(DUES),
    "GET /customers": () => json(CUSTOMERS),
    ...extra,
  });
}

describe("Dues", () => {
  it("shows the total, its age, and each customer who owes", async () => {
    await renderApp(duesApi(), { path: "/dues" });

    const list = await screen.findByRole("list", { name: "Customers who owe" });
    expect(screen.getByText("Customers owe").nextElementSibling).toHaveTextContent("₹25,500");
    expect(screen.getByText("1 to 3 months").nextElementSibling).toHaveTextContent("₹18,500");
    expect(screen.getByText("Over 3 months").nextElementSibling).toHaveTextContent("₹0");
    const ramesh = within(list).getByRole("link", { name: /Ramesh Bishnoi/ });
    expect(ramesh).toHaveAttribute("href", "/dues/7");
    expect(ramesh).toHaveTextContent("Oldest due 34 days");
    expect(within(list).getByRole("link", { name: /Sunil Jat/ })).toHaveTextContent(
      "has credit to apply",
    );
  });

  it("offers taking money from a customer under the name", async () => {
    await renderApp(duesApi(), { path: "/dues" });

    expect(await screen.findByRole("link", { name: "Money from customer" })).toHaveAttribute(
      "href",
      "/new/payment",
    );
  });

  it("lists every customer on the second tab, with what each owes", async () => {
    const { user, router } = await renderApp(duesApi(), { path: "/dues" });

    await user.click(await screen.findByRole("button", { name: "All customers" }));

    const list = await screen.findByRole("list", { name: "Customers" });
    expect(within(list).getByRole("link", { name: /Ramesh Bishnoi/ })).toHaveTextContent("₹18,500");
    expect(router.state.location.search).toBe("?tab=all");
  });

  it("adds a customer and opens their account", async () => {
    const created: unknown[] = [];
    const api = duesApi({
      "POST /customers": async (request) => {
        created.push(await request.json());
        return json(
          { customer: { ...CUSTOMERS.items[0], id: 9, name: "Gopal Ram" }, possibleDuplicates: [] },
          201,
        );
      },
      "GET /customers/9": () => json({ ...CUSTOMERS.items[0], id: 9, name: "Gopal Ram" }),
      "GET /customers/9/ledger": () =>
        json({
          customer: { id: 9, name: "Gopal Ram", phone: null },
          from: "2026-04-01",
          to: "2026-10-28",
          openingBalancePaise: 0,
          entries: [],
          totals: { debitPaise: 0, creditPaise: 0 },
          closingBalancePaise: 0,
        }),
      "GET /trips": () =>
        json({
          items: [],
          total: 0,
          page: 1,
          limit: 1,
          totals: { count: 0, amountPaise: 0, receivedPaise: 0, duePaise: 0 },
        }),
    });
    const { user, router } = await renderApp(api, { path: "/dues" });

    await user.click(await screen.findByRole("button", { name: "Add customer" }));
    const sheet = screen.getByRole("dialog", { name: "Add customer" });
    await user.type(within(sheet).getByLabelText("Name"), "Gopal Ram");
    await user.click(within(sheet).getByRole("button", { name: "Add customer" }));

    expect(await screen.findByText("Gopal Ram added.")).toBeInTheDocument();
    expect(created).toEqual([{ name: "Gopal Ram" }]);
    expect(router.state.location.pathname).toBe("/dues/9");
  });
});
