import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, json } from "../../test/fake-api.ts";
import { CUSTOMERS, DUES, LEDGER, tripPage, TRIP, BALANCE_ROUTES } from "../../test/fixtures.ts";
import { renderApp, signedInRoutes } from "../../test/render.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const ramesh = CUSTOMERS.items[0];
const sunil = CUSTOMERS.items[1];
const opening = { ...TRIP, id: 30, kind: "OPENING_BALANCE" as const };

function accountApi(
  extra: Record<string, (request: Request) => Response | Promise<Response>> = {},
  hasOpening = true,
) {
  return fakeApi({
    ...signedInRoutes,
    ...BALANCE_ROUTES,
    "GET /customers/7": () => json(ramesh),
    "GET /customers/8": () => json(sunil),
    "GET /customers/7/ledger": () => json(LEDGER),
    "GET /customers/8/ledger": () => json({ ...LEDGER, entries: [] }),
    "GET /dues": () => json(DUES),
    "GET /trips": () => json(tripPage(hasOpening ? [opening] : [])),
    ...extra,
  });
}

describe("A customer's account", () => {
  it("shows what they owe, how to reach them, and the account line by line", async () => {
    await renderApp(accountApi(), { path: "/dues/7" });

    expect(await screen.findByRole("heading", { name: "Ramesh Bishnoi" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "9829041733" })).toHaveAttribute(
      "href",
      "tel:+919829041733",
    );
    expect((await screen.findByText("Owes you")).parentElement).toHaveTextContent("₹18,500");
    const table = await screen.findByRole("table", { name: "Account entries" });
    expect(within(table).getByRole("link", { name: /Paid in cash/ })).toHaveAttribute(
      "href",
      "/payments/51",
    );
    expect(within(table).getByRole("link", { name: /Trip, Ladnun road/ })).toHaveAttribute(
      "href",
      "/trips/41",
    );
    expect(screen.getByText(/Balance at the end/)).toHaveTextContent("₹21,000");
  });

  it("shows credit held for a customer the dues list leaves out, and offers to use it", async () => {
    const api = accountApi({
      "GET /customers/7/balance": () =>
        json({ balancePaise: -200000, duePaise: 100000, creditPaise: 300000 }),
    });

    await renderApp(api, { path: "/dues/7" });

    expect((await screen.findByText("Has credit")).parentElement).toHaveTextContent("₹2,000");
    expect(screen.getByRole("button", { name: "Use credit on dues" })).toBeInTheDocument();
  });

  it("opens payment and write-off entries with the customer already chosen", async () => {
    await renderApp(accountApi(), { path: "/dues/7" });

    expect(await screen.findByRole("link", { name: "Money from Ramesh Bishnoi" })).toHaveAttribute(
      "href",
      "/new/payment?customer=7",
    );
    expect(screen.getByRole("link", { name: "Write off" })).toHaveAttribute(
      "href",
      "/new/payment?customer=7&kind=writeoff",
    );
    expect(screen.queryByRole("button", { name: "Use credit on dues" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Old register balance" })).not.toBeInTheDocument();
  });

  it("uses credit on old dues after asking", async () => {
    let key: string | null = null;
    const api = accountApi({
      "POST /customers/8/apply-credit": (request) => {
        key = request.headers.get("idempotency-key");
        return json({
          allocations: [{ paymentId: 60, tripId: 44, amountPaise: 200000 }],
          customerBalance: { balancePaise: 700000, duePaise: 700000, creditPaise: 0 },
        });
      },
    });
    const { user } = await renderApp(api, { path: "/dues/8" });

    await user.click(await screen.findByRole("button", { name: "Use credit on dues" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Use credit" }),
    );

    expect(
      await screen.findByText("₹2,000 of credit used. Sunil Jat now owes ₹7,000."),
    ).toBeInTheDocument();
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("adds the old register balance once, when there is none", async () => {
    const sent: unknown[] = [];
    const api = accountApi(
      {
        "POST /customers/7/opening-balance": async (request) => {
          sent.push(await request.json());
          return json(
            {
              trip: opening,
              customerBalance: { balancePaise: 2350000, duePaise: 2350000, creditPaise: 0 },
              warnings: [],
            },
            201,
          );
        },
      },
      false,
    );
    const { user } = await renderApp(api, { path: "/dues/7" });

    await user.click(await screen.findByRole("button", { name: "Old register balance" }));
    const sheet = screen.getByRole("dialog", { name: "Old register balance" });
    await user.type(within(sheet).getByLabelText("Amount owed"), "23500");
    await user.click(within(sheet).getByRole("button", { name: "Add old balance" }));

    expect(
      await screen.findByText("Old balance added. Ramesh Bishnoi now owes ₹23,500."),
    ).toBeInTheDocument();
    expect(sent).toEqual([{ amount: "23500" }]);
  });

  it("saves changed details only, clearing a phone with null", async () => {
    const sent: unknown[] = [];
    const api = accountApi({
      "PATCH /customers/7": async (request) => {
        sent.push(await request.json());
        return json({ ...ramesh, phone: null, isActive: false });
      },
    });
    const { user } = await renderApp(api, { path: "/dues/7" });

    await user.click(await screen.findByRole("button", { name: "Edit details" }));
    const sheet = screen.getByRole("dialog", { name: "Edit details" });
    await user.clear(within(sheet).getByLabelText("Phone"));
    await user.click(within(sheet).getByLabelText(/Active/));
    await user.click(within(sheet).getByRole("button", { name: "Save details" }));

    expect(await screen.findByText("Details saved.")).toBeInTheDocument();
    expect(sent).toEqual([{ phone: null, isActive: false }]);
  });

  it("asks for the account between two dates and says what came before", async () => {
    const asked: URL[] = [];
    const api = accountApi({
      "GET /customers/7/ledger": (request) => {
        asked.push(new URL(request.url));
        return json({ ...LEDGER, openingBalancePaise: 1750000 });
      },
    });
    const { user } = await renderApp(api, { path: "/dues/7" });
    await screen.findByRole("table", { name: "Account entries" });

    await user.click(screen.getByRole("button", { name: "This month" }));

    expect(await screen.findByText(/Brought forward from before 1 Oct/)).toHaveTextContent(
      "₹17,500",
    );
    expect(asked.at(-1)?.searchParams.get("from")).toBe("2026-10-01");
  });
});
