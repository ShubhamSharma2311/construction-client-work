import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, fakeApi, json } from "../../test/fake-api.ts";
import {
  CUSTOMERS,
  DRIVERS,
  KHETS,
  NO_DUES,
  TRACTORS,
  TRIP,
  tripPage,
  BALANCE_ROUTES,
} from "../../test/fixtures.ts";
import { renderApp, signedInRoutes } from "../../test/render.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const balance = { balancePaise: 1500000, duePaise: 1500000, creditPaise: 0 };
const partPaid = { ...TRIP, receivedPaise: 200000, duePaise: 150000, status: "PARTIAL" as const };

function tripApi(
  trip = TRIP,
  extra: Record<string, (request: Request) => Response | Promise<Response>> = {},
) {
  return fakeApi({
    ...signedInRoutes,
    ...BALANCE_ROUTES,
    "GET /trips/41": () => json(trip),
    "GET /trips": () => json(tripPage([])),
    "GET /drivers": () => json(DRIVERS),
    "GET /tractors": () => json(TRACTORS),
    "GET /khets": () => json(KHETS),
    "GET /customers": () => json(CUSTOMERS),
    "GET /dues": () => json(NO_DUES),
    ...extra,
  });
}

describe("A trip", () => {
  it("shows every detail and links to the customer's account", async () => {
    await renderApp(tripApi(partPaid), { path: "/trips/41" });

    expect(
      await screen.findByRole("heading", { name: "Trip on Wed, 28 Oct 2026" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ramesh Bishnoi" })).toHaveAttribute("href", "/dues/7");
    expect(screen.getByText("Still due").nextElementSibling).toHaveTextContent("₹1,500");
    expect(screen.getByText("Part paid")).toBeInTheDocument();
  });

  it("deletes a trip with nothing received after asking", async () => {
    let deleted: URL | undefined;
    const api = tripApi(TRIP, {
      "DELETE /trips/41": (request) => {
        deleted = new URL(request.url);
        return json({
          trip: { ...TRIP, deletedAt: "2026-10-28T07:00:00Z" },
          releasedPaise: 0,
          customerBalance: balance,
        });
      },
    });
    const { user, router } = await renderApp(api, { path: "/trips/41" });

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete this entry?" });
    expect(dialog).toHaveTextContent("It can be restored later");
    await user.click(within(dialog).getByRole("button", { name: "Delete entry" }));

    expect(
      await screen.findByText("Entry deleted. Ramesh Bishnoi now owes ₹15,000."),
    ).toBeInTheDocument();
    expect(deleted?.searchParams.has("releasePayments")).toBe(false);
    expect(router.state.location.pathname).toBe("/trips");
  });

  it("explains that money already received becomes credit, and says so after", async () => {
    let deleted: URL | undefined;
    const api = tripApi(partPaid, {
      "DELETE /trips/41": (request) => {
        deleted = new URL(request.url);
        return json({
          trip: partPaid,
          releasedPaise: 200000,
          customerBalance: { balancePaise: -200000, duePaise: 0, creditPaise: 200000 },
        });
      },
    });
    const { user } = await renderApp(api, { path: "/trips/41" });

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("₹2,000 was received for this trip.");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete and move ₹2,000 to credit" }),
    );

    expect(
      await screen.findByText(/₹2,000 moved to credit. Ramesh Bishnoi now has ₹2,000 credit./),
    ).toBeInTheDocument();
    expect(deleted?.searchParams.get("releasePayments")).toBe("true");
  });

  it("keeps the dialog open with the reason when deleting fails", async () => {
    const api = tripApi(TRIP, {
      "DELETE /trips/41": () => apiError(409, "CONFLICT", "Trip has payments"),
    });
    const { user } = await renderApp(api, { path: "/trips/41" });

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete entry" }));

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
      "Trip has payments.",
    );
  });

  it("restores a deleted trip", async () => {
    const deletedTrip = { ...TRIP, deletedAt: "2026-10-28T07:00:00Z" };
    const api = tripApi(deletedTrip, {
      "POST /trips/41/restore": () => json({ trip: TRIP, customerBalance: balance, warnings: [] }),
    });
    const { user } = await renderApp(api, { path: "/trips/41" });

    expect(await screen.findByText("Deleted")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit trip" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore entry" }));

    expect(
      await screen.findByText("Entry restored. Ramesh Bishnoi now owes ₹15,000."),
    ).toBeInTheDocument();
  });

  it("answers an address that is not a trip number with page not found", async () => {
    await renderApp(tripApi(), { path: "/trips/abc" });

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});

describe("Editing a trip", () => {
  it("sends only what changed and returns to the trip", async () => {
    const sent: unknown[] = [];
    const api = tripApi(TRIP, {
      "PATCH /trips/41": async (request) => {
        sent.push(await request.json());
        return json({
          trip: { ...TRIP, amountPaise: 400000 },
          customerBalance: balance,
          warnings: [],
        });
      },
    });
    const { user, router } = await renderApp(api, { path: "/trips/41/edit" });

    const amount = await screen.findByLabelText("Trip amount");
    await user.clear(amount);
    await user.type(amount, "4000");
    expect(screen.queryByText("How it was paid")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Trip updated. Ramesh Bishnoi now owes ₹15,000."),
    ).toBeInTheDocument();
    expect(sent).toEqual([{ amount: "4000" }]);
    expect(router.state.location.pathname).toBe("/trips/41");
  });

  it("sends nothing when nothing changed", async () => {
    const api = tripApi();
    const { user, router } = await renderApp(api, { path: "/trips/41/edit" });

    await user.click(await screen.findByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Nothing was changed.")).toBeInTheDocument();
    expect(api.calls).not.toContain("PATCH /trips/41");
    expect(router.state.location.pathname).toBe("/trips/41");
  });
});
