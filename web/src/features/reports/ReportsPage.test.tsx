import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, fakeApi, json } from "../../test/fake-api.ts";
import {
  CASH_BOOK,
  DAY_SUMMARY,
  DRIVER_REPORT,
  KHET_REPORT,
  PROFIT,
  TRACTOR_REPORT,
} from "../../test/fixtures.ts";
import { renderApp, SETTINGS, signedInRoutes } from "../../test/render.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type Handler = (request: Request) => Response | Promise<Response>;

/** Every report, recording what each was asked for. */
function reportsApi(extra: Record<string, Handler> = {}) {
  const asked: URL[] = [];
  const answer = (body: unknown) => (request: Request) => {
    asked.push(new URL(request.url));
    return json(body);
  };
  const api = fakeApi({
    ...signedInRoutes,
    "GET /reports/pnl": answer(PROFIT),
    "GET /reports/cashbook": answer(CASH_BOOK),
    "GET /reports/summary": answer(DAY_SUMMARY),
    "GET /reports/tractors": answer(TRACTOR_REPORT),
    "GET /reports/khets": answer(KHET_REPORT),
    "GET /reports/drivers": answer(DRIVER_REPORT),
    ...extra,
  });
  return { api, asked };
}

describe("Reports", () => {
  it("opens on this month's profit, set out as came in and went out", async () => {
    const { api, asked } = reportsApi();

    await renderApp(api, { path: "/reports" });

    const total = await screen.findByText("₹1,42,300");
    expect(total.closest("div")).toHaveTextContent("Profit₹1,42,300");
    const cameIn = screen.getByRole("list", { name: "Income" });
    expect(cameIn).toHaveTextContent("Trips₹3,15,000");
    expect(cameIn).toHaveTextContent("Less discounts");
    expect(cameIn).toHaveTextContent("Total income₹3,14,800");
    const wentOut = screen.getByRole("list", { name: "Expenses" });
    expect(wentOut).toHaveTextContent("Diesel₹98,500");
    expect(wentOut).toHaveTextContent("Driver salaries");
    expect(wentOut).toHaveTextContent("Total₹1,72,500");
    // A category with nothing spent is left out rather than listed as ₹0.
    expect(wentOut).not.toHaveTextContent("Royalty");
    expect(asked[0]?.searchParams.get("from")).toBe("2026-10-01");
    expect(asked[0]?.searchParams.get("to")).toBe("2026-10-28");
  });

  it("calls a loss a loss", async () => {
    const { api } = reportsApi({
      "GET /reports/pnl": () => json({ ...PROFIT, profitPaise: -500000 }),
    });

    await renderApp(api, { path: "/reports" });

    expect(await screen.findByText("Loss")).toBeInTheDocument();
    expect(screen.getByText("₹5,000")).toBeInTheDocument();
  });

  it("shows the cash book with opening, each line and closing, and switches to online", async () => {
    const { api, asked } = reportsApi();
    const { user } = await renderApp(api, { path: "/reports?report=cashbook" });

    const totals = await screen.findByLabelText("Money in & out totals");
    expect(totals).toHaveTextContent("Opening balance₹10,000");
    expect(totals).toHaveTextContent("Closing balance−₹3,000");
    const table = screen.getByRole("table", { name: "Money in & out" });
    expect(
      within(table).getByRole("link", { name: /Payment from Ramesh Bishnoi/ }),
    ).toHaveAttribute("href", "/payments/31");
    expect(within(table).getByRole("link", { name: /Diesel, RJ19 GA 4521/ })).toHaveAttribute(
      "href",
      "/expenses/41",
    );
    // A driver's advance is seen on the driver's own page, so the line does not open anything.
    expect(within(table).queryByRole("link", { name: /Advance to Suresh/ })).toBeNull();
    expect(asked.at(-1)?.searchParams.get("mode")).toBe("CASH");

    await user.click(screen.getByRole("radio", { name: "Online" }));

    await vi.waitFor(() => {
      expect(asked.at(-1)?.searchParams.get("mode")).toBe("ONLINE");
    });
  });

  it("lists each day, opening that day's Today screen", async () => {
    const { api } = reportsApi();

    await renderApp(api, { path: "/reports?report=days" });

    const table = await screen.findByRole("table", { name: "Daily summary" });
    expect(within(table).getByRole("link", { name: "27 Oct" })).toHaveAttribute(
      "href",
      "/?date=2026-10-27",
    );
    expect(screen.getByLabelText("Totals")).toHaveTextContent("Came in₹23,500");
  });

  it("shows a tractor that cost more than it earned in red", async () => {
    const { api } = reportsApi();

    await renderApp(api, { path: "/reports?report=tractors" });

    const table = await screen.findByRole("table", { name: "By tractor" });
    expect(within(table).getByRole("link", { name: "RJ 21 RA 4412" })).toHaveAttribute(
      "href",
      "/tractors/3",
    );
    expect(within(table).getByText("−₹8,000").className).toMatch(/owed/);
    expect(within(table).getByText("₹70,000").className).not.toMatch(/owed/);
  });

  it("lists khets and drivers", async () => {
    const { api } = reportsApi();
    const { user } = await renderApp(api, { path: "/reports?report=khets" });

    expect(await screen.findByRole("table", { name: "By khet" })).toHaveTextContent("Ladnun road");

    await user.click(screen.getByRole("button", { name: "By driver" }));

    const drivers = await screen.findByRole("table", { name: "By driver" });
    expect(within(drivers).getByRole("link", { name: "Suresh" })).toHaveAttribute(
      "href",
      "/drivers/2",
    );
    expect(drivers).toHaveTextContent("412.5 L");
  });

  it("asks all time from the day the business started", async () => {
    const { api, asked } = reportsApi();
    const { user } = await renderApp(api, { path: "/reports" });
    await screen.findByRole("list", { name: "Income" });

    await user.click(screen.getByRole("button", { name: "All time" }));

    await vi.waitFor(() => {
      expect(asked.at(-1)?.searchParams.get("from")).toBe(SETTINGS.businessStartDate);
    });
    expect(asked.at(-1)?.searchParams.get("to")).toBe("2026-10-28");
  });

  it("starts a range that began earlier on the first day of the business", async () => {
    const { api, asked } = reportsApi();

    await renderApp(api, { path: "/reports?from=2026-03-01&to=2026-04-30" });

    await screen.findByRole("list", { name: "Income" });
    expect(asked.at(-1)?.searchParams.get("from")).toBe("2026-04-01");
  });

  it("asks nothing for dates before the business started", async () => {
    const { api, asked } = reportsApi();

    await renderApp(api, { path: "/reports?from=2026-03-01&to=2026-03-31" });

    expect(
      await screen.findByText("The business started on 1 Apr, so there is nothing before that."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    expect(asked).toHaveLength(0);
  });

  it("shows at most the last 366 days day by day, and says so", async () => {
    const { api, asked } = reportsApi({
      "GET /settings": () => json({ ...SETTINGS, businessStartDate: "2025-01-01" }),
    });

    await renderApp(api, { path: "/reports?report=days&range=all" });

    expect(
      await screen.findByText("Daily summary shows at most a year, so it starts on 28 Oct 2025."),
    ).toBeInTheDocument();
    expect(asked.at(-1)?.searchParams.get("from")).toBe("2025-10-28");
    expect(asked.at(-1)?.searchParams.get("to")).toBe("2026-10-28");
  });

  it("drops an old download error when the report changes", async () => {
    const { api } = reportsApi();
    const failing = {
      ...api,
      fetch: (request: Request) =>
        new URL(request.url).pathname.endsWith("/export")
          ? Promise.resolve(apiError(500, "INTERNAL", "Export broke"))
          : api.fetch(request),
    };
    const { user } = await renderApp(failing, { path: "/reports" });
    await screen.findByRole("list", { name: "Income" });

    await user.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "By khet" }));

    await screen.findByRole("table", { name: "By khet" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says why a report did not load", async () => {
    const { api } = reportsApi({
      "GET /reports/khets": () => apiError(500, "INTERNAL", "Something broke"),
    });

    await renderApp(api, { path: "/reports?report=khets" });

    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("downloads the report on screen, for the same dates", async () => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }),
    );
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    let exportUrl: URL | undefined;
    const { api } = reportsApi();
    const withExport = {
      ...api,
      fetch: (request: Request) => {
        if (new URL(request.url).pathname.endsWith("/export")) {
          exportUrl = new URL(request.url);
          return Promise.resolve(new Response("date\n"));
        }
        return api.fetch(request);
      },
    };
    const { user } = await renderApp(withExport, {
      path: "/reports?report=cashbook&mode=ONLINE&from=2026-10-26&to=2026-10-28",
    });
    await screen.findByRole("table", { name: "Money in & out" });

    await user.click(screen.getByRole("button", { name: "Download" }));

    await vi.waitFor(() => {
      expect(clicked).toHaveBeenCalled();
    });
    expect(exportUrl?.pathname).toMatch(/\/reports\/cashbook\/export$/);
    expect(exportUrl?.searchParams.get("from")).toBe("2026-10-26");
    expect(exportUrl?.searchParams.get("mode")).toBe("ONLINE");
  });
});
