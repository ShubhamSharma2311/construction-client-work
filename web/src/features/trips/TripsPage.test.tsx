import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, json } from "../../test/fake-api.ts";
import { DRIVERS, KHETS, TRACTORS, TRIP, tripPage } from "../../test/fixtures.ts";
import { renderApp, signedInRoutes } from "../../test/render.tsx";

const masters = {
  "GET /drivers": () => json(DRIVERS),
  "GET /tractors": () => json(TRACTORS),
  "GET /khets": () => json(KHETS),
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function tripsApi(answer: (url: URL) => unknown) {
  const asked: URL[] = [];
  const api = fakeApi({
    ...signedInRoutes,
    ...masters,
    "GET /trips": (request) => {
      const url = new URL(request.url);
      asked.push(url);
      return json(answer(url));
    },
  });
  return { api, asked };
}

const paid = {
  ...TRIP,
  id: 42,
  customer: { id: 8, name: "Sunil Jat" },
  receivedPaise: 350000,
  duePaise: 0,
  status: "PAID" as const,
};

describe("Trips list", () => {
  it("opens on this week, with totals and one line per trip", async () => {
    const { api, asked } = tripsApi(() => tripPage([TRIP, paid]));

    await renderApp(api, { path: "/trips" });

    const table = await screen.findByRole("table", { name: "Trips" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByRole("link", { name: "Ramesh Bishnoi, 28 Oct" })).toHaveAttribute(
      "href",
      "/trips/41",
    );
    expect(within(table).getByText("Due")).toBeInTheDocument();
    expect(screen.getByText("Still due").nextElementSibling).toHaveTextContent("₹3,500");
    expect(asked[0]?.searchParams.get("from")).toBe("2026-10-26");
    expect(asked[0]?.searchParams.get("to")).toBe("2026-10-28");
    expect(screen.getByRole("button", { name: "This week" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("narrows the list by date and driver, and keeps that in the address", async () => {
    const { api, asked } = tripsApi(() => tripPage([TRIP]));
    const { user, router } = await renderApp(api, { path: "/trips" });
    await screen.findByRole("table", { name: "Trips" });

    await user.click(screen.getByRole("button", { name: "This month" }));
    await user.click(screen.getByText("Filters"));
    await user.selectOptions(screen.getByLabelText("Driver"), "Suresh");

    await vi.waitFor(() => {
      expect(asked.at(-1)?.searchParams.get("driverId")).toBe("2");
    });
    expect(asked.at(-1)?.searchParams.get("from")).toBe("2026-10-01");
    expect(router.state.location.search).toBe("?from=2026-10-01&to=2026-10-28&driver=2");
  });

  it("asks for all time without dates", async () => {
    const { api, asked } = tripsApi(() => tripPage([TRIP]));
    const { user } = await renderApp(api, { path: "/trips" });
    await screen.findByRole("table", { name: "Trips" });

    await user.click(screen.getByRole("button", { name: "All time" }));

    await vi.waitFor(() => {
      expect(asked.at(-1)?.searchParams.has("from")).toBe(false);
    });
  });

  it("loads the next 50 on Show more", async () => {
    const { api } = tripsApi((url) =>
      url.searchParams.get("page") === "2" ? tripPage([paid], 51, 2) : tripPage([TRIP], 51),
    );
    const { user } = await renderApp(api, { path: "/trips" });

    expect(await screen.findByText("Showing 1 of 51")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show more" }));

    expect(await screen.findByRole("link", { name: "Sunil Jat, 28 Oct" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("opens a trip from anywhere on its line", async () => {
    const { api } = tripsApi(() => tripPage([TRIP]));
    const { user, router } = await renderApp(api, {
      path: "/trips",
    });
    const table = await screen.findByRole("table", { name: "Trips" });

    await user.click(within(table).getByText("Ladnun road"));

    expect(router.state.location.pathname).toBe("/trips/41");
  });

  it("says when there are no trips", async () => {
    const { api } = tripsApi(() => tripPage([]));

    await renderApp(api, { path: "/trips" });

    expect(await screen.findByText("No trips in these dates.")).toBeInTheDocument();
  });

  it("downloads the same trips as a spreadsheet file", async () => {
    const created = vi.fn(() => "blob:trips");
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() }),
    );
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    let exportUrl: URL | undefined;
    const { api } = tripsApi(() => tripPage([TRIP]));
    const withExport = {
      ...api,
      fetch: (request: Request) => {
        if (new URL(request.url).pathname.endsWith("/trips/export")) {
          exportUrl = new URL(request.url);
          return Promise.resolve(
            new Response("date,customer\n", {
              headers: {
                "content-disposition": 'attachment; filename="trips-2026-10-26-to-2026-10-28.csv"',
              },
            }),
          );
        }
        return api.fetch(request);
      },
    };
    const { user } = await renderApp(withExport, {
      path: "/trips?from=2026-10-26&to=2026-10-28&driver=2",
    });
    await screen.findByRole("table", { name: "Trips" });

    await user.click(screen.getByRole("button", { name: "Download" }));

    await vi.waitFor(() => {
      expect(clicked).toHaveBeenCalled();
    });
    expect(exportUrl?.searchParams.get("driverId")).toBe("2");
    expect(created).toHaveBeenCalled();
    vi.unstubAllGlobals();
    clicked.mockRestore();
  });
});
