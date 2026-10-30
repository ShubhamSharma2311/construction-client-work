import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, json } from "../../test/fake-api.ts";
import { EMI_DUE, LOAN, LOAN_SUMMARY, SERVICES, TRACTORS } from "../../test/fixtures.ts";
import { renderApp, signedInRoutes } from "../../test/render.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const PAID_OFF = {
  ...LOAN_SUMMARY,
  id: 4,
  lender: "Swaraj Finance",
  closedOn: "2026-03-10",
  closedReason: "PAID_OFF" as const,
};

function tractorsApi(
  extra: Record<string, (request: Request) => Response | Promise<Response>> = {},
) {
  return fakeApi({
    ...signedInRoutes,
    "GET /emi/due": () => json(EMI_DUE),
    "GET /tractors": () => json(TRACTORS),
    // Running loans unless the screen asks for all of a tractor's, closed ones included.
    "GET /loans": (request) =>
      json(
        new URL(request.url).searchParams.get("status") === "all"
          ? [LOAN_SUMMARY, PAID_OFF]
          : [LOAN_SUMMARY],
      ),
    "GET /loans/5": () => json(LOAN),
    "GET /tractors/3": () => json(TRACTORS.items[0]),
    "GET /tractors/3/services": () => json(SERVICES),
    ...extra,
  });
}

describe("Tractors and EMI", () => {
  it("puts overdue EMIs first, each opening Pay EMI on its month", async () => {
    await renderApp(tractorsApi(), { path: "/tractors" });

    const due = await screen.findByRole("list", { name: "EMIs due" });
    const late = within(due).getByRole("link", { name: /Sept? 2026/ });
    expect(late).toHaveTextContent("Mahindra Finance, 53 days late");
    expect(late).toHaveAttribute("href", "/loans/5?pay=2026-09");
    expect(within(due).getByRole("link", { name: /Nov 2026/ })).toHaveTextContent("due 5 Nov");
  });

  it("lists each tractor with its usual driver and how its loan stands", async () => {
    await renderApp(tractorsApi(), { path: "/tractors" });

    const list = await screen.findByRole("list", { name: "Tractors" });
    await vi.waitFor(() => {
      expect(within(list).getByRole("link", { name: /RJ 21 RA 4412/ })).toHaveTextContent(
        "Suresh, Mahindra Finance: 1 of 4 EMIs paid",
      );
    });
    expect(within(list).getByRole("link", { name: /RJ 21 RB 1190/ })).toHaveTextContent(
      "No loan running",
    );
  });

  it("adds a tractor and opens it", async () => {
    const sent: unknown[] = [];
    const api = tractorsApi({
      "POST /tractors": async (request) => {
        sent.push(await request.json());
        return json(TRACTORS.items[0], 201);
      },
    });
    const { user, router } = await renderApp(api, { path: "/tractors" });

    await user.click(await screen.findByRole("button", { name: "Add tractor" }));
    const sheet = screen.getByRole("dialog", { name: "Add tractor" });
    await user.type(within(sheet).getByLabelText("Registration number"), "rj 21 ra 4412");
    await user.type(within(sheet).getByLabelText("Name to know it by"), "Mahindra 575");
    await user.click(within(sheet).getByRole("button", { name: "Add tractor" }));

    expect(await screen.findByText("RJ 21 RA 4412 added.")).toBeInTheDocument();
    expect(sent).toEqual([{ regNumber: "rj 21 ra 4412", label: "Mahindra 575" }]);
    expect(router.state.location.pathname).toBe("/tractors/3");
  });
});

describe("A tractor", () => {
  it("shows its loans and service history, with a way to record the next service", async () => {
    await renderApp(tractorsApi(), { path: "/tractors/3" });

    expect(await screen.findByText("Last serviced 12 Oct at 1450 hours.")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Loans" })).toHaveTextContent(
      "1 of 4 EMIs paid, 1 overdue",
    );
    expect(screen.getByRole("link", { name: "Record service" })).toHaveAttribute(
      "href",
      "/new/service?tractor=3",
    );
  });

  it("lists a paid-off loan with the running one", async () => {
    await renderApp(tractorsApi(), { path: "/tractors/3" });

    const loans = await screen.findByRole("list", { name: "Loans" });
    expect(within(loans).getByRole("link", { name: /Swaraj Finance/ })).toHaveTextContent(
      "Closed, 1 of 4 EMIs paid",
    );
    // One loan is running, so a second cannot be added until it closes.
    expect(screen.queryByRole("button", { name: "Add loan" })).not.toBeInTheDocument();
  });

  it("adds a loan after checking it, then opens it", async () => {
    const sent: unknown[] = [];
    const api = tractorsApi({
      "GET /loans": () => json([]),
      "POST /tractors/3/loans": async (request) => {
        sent.push(await request.json());
        return json(LOAN, 201);
      },
    });
    const { user, router } = await renderApp(api, { path: "/tractors/3" });

    await user.click(await screen.findByRole("button", { name: "Add loan" }));
    const sheet = screen.getByRole("dialog");
    await user.type(within(sheet).getByLabelText("Bank or finance company"), "Mahindra Finance");
    await user.type(within(sheet).getByLabelText("EMI amount"), "18200");
    await user.type(within(sheet).getByLabelText("EMI day of the month"), "31");
    await user.click(within(sheet).getByRole("button", { name: "Add loan" }));
    expect(within(sheet).getByText("Pick a day from 1 to 28")).toBeInTheDocument();
    await user.clear(within(sheet).getByLabelText("EMI day of the month"));
    await user.type(within(sheet).getByLabelText("EMI day of the month"), "5");
    await user.selectOptions(within(sheet).getByLabelText("First EMI month: month"), "Aug");
    await user.selectOptions(within(sheet).getByLabelText("First EMI month: year"), "2026");
    await user.type(within(sheet).getByLabelText("Number of EMIs"), "4");
    await user.click(within(sheet).getByRole("button", { name: "Add loan" }));

    expect(await screen.findByText(/Loan from Mahindra Finance added/)).toBeInTheDocument();
    expect(sent).toEqual([
      {
        lender: "Mahindra Finance",
        emiAmount: "18200",
        emiDay: 5,
        firstEmiMonth: "2026-08",
        totalInstallments: 4,
      },
    ]);
    expect(router.state.location.pathname).toBe("/loans/5");
  });
});

describe("Editing a tractor", () => {
  it("sends only what changed, including taking it out of use", async () => {
    const sent: unknown[] = [];
    const api = tractorsApi({
      "PATCH /tractors/3": async (request) => {
        sent.push(await request.json());
        return json({ ...TRACTORS.items[0], label: "Mahindra 575 DI", isActive: false });
      },
    });
    const { user } = await renderApp(api, { path: "/tractors/3" });

    await user.click(await screen.findByRole("button", { name: "Edit details" }));
    const sheet = screen.getByRole("dialog", { name: "Edit details" });
    await user.type(within(sheet).getByLabelText("Name to know it by"), " DI");
    await user.click(within(sheet).getByLabelText(/Active/));
    await user.click(within(sheet).getByRole("button", { name: "Save details" }));

    expect(await screen.findByText("Details saved.")).toBeInTheDocument();
    expect(sent).toEqual([{ label: "Mahindra 575 DI", isActive: false }]);
  });
});

describe("Tractor EMI from New entry", () => {
  it("lists running loans, each opening Pay EMI on the next month due", async () => {
    await renderApp(tractorsApi(), { path: "/new/emi" });

    const loans = await screen.findByRole("list", { name: "Loans running" });
    expect(within(loans).getByRole("link", { name: /Mahindra Finance/ })).toHaveAttribute(
      "href",
      "/loans/5?pay=2026-09",
    );
  });
});
