import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, json } from "../../test/fake-api.ts";
import {
  DIESEL_REPORT,
  DRIVERS,
  EXPENSE,
  expensePage,
  LABOURERS,
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

const labour = {
  ...EXPENSE,
  id: 62,
  category: "LABOUR" as const,
  tractor: null,
  driver: null,
  dieselLitres: null,
  labourer: { id: 11, name: "Mangilal" },
  amountPaise: 50000,
};

function expensesApi() {
  const asked: URL[] = [];
  const api = fakeApi({
    ...signedInRoutes,
    "GET /tractors": () => json(TRACTORS),
    "GET /drivers": () => json(DRIVERS),
    "GET /labourers": () => json(LABOURERS),
    "GET /expenses": (request) => {
      asked.push(new URL(request.url));
      return json(expensePage([EXPENSE, labour]));
    },
    "GET /reports/diesel": () => json(DIESEL_REPORT),
  });
  return { api, asked };
}

describe("Expenses", () => {
  it("lists this month's expenses with totals by kind", async () => {
    const { api, asked } = expensesApi();

    await renderApp(api, { path: "/expenses" });

    const table = await screen.findByRole("table", { name: "Expenses" });
    expect(within(table).getByRole("link", { name: "Diesel, 28 Oct" })).toHaveAttribute(
      "href",
      "/expenses/61",
    );
    expect(within(table).getByText("RJ 21 RA 4412, Suresh, 47.5 L")).toBeInTheDocument();
    expect(screen.getByText("Spent").nextElementSibling).toHaveTextContent("₹5,000");
    expect(screen.getByRole("list", { name: "Spent by kind" })).toHaveTextContent(
      "Diesel ₹4,500Labour ₹500",
    );
    expect(asked[0]?.searchParams.get("from")).toBe("2026-10-01");
  });

  it("narrows to one kind and keeps it in the address", async () => {
    const { api, asked } = expensesApi();
    const { user, router } = await renderApp(api, { path: "/expenses" });
    await screen.findByRole("table", { name: "Expenses" });

    await user.click(screen.getByText("Filters"));
    await user.selectOptions(screen.getByLabelText("Kind"), "Labour");

    await vi.waitFor(() => {
      expect(asked.at(-1)?.searchParams.get("category")).toBe("LABOUR");
    });
    expect(router.state.location.search).toContain("category=LABOUR");
  });

  it("shows diesel by tractor and driver, flags a tractor with no trips, and links to its bills", async () => {
    const { api } = expensesApi();
    const { user } = await renderApp(api, { path: "/expenses" });

    await user.click(await screen.findByRole("button", { name: "Diesel report" }));

    const tractors = await screen.findByRole("table", { name: "Diesel by tractor" });
    expect(within(tractors).getByText("no trips")).toBeInTheDocument();
    expect(
      within(tractors).getByRole("link", { name: "RJ 21 RA 4412 diesel bills" }),
    ).toHaveAttribute("href", "/expenses?from=2026-10-01&to=2026-10-28&category=DIESEL&tractor=3");
    expect(screen.getByRole("table", { name: "Diesel by driver" })).toHaveTextContent("Suresh");
    expect(screen.getByText("Diesel").nextElementSibling).toHaveTextContent("135 L");
  });
});
