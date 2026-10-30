import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, fakeApi, json } from "../../test/fake-api.ts";
import { DASHBOARD, renderApp, signedInRoutes } from "../../test/render.tsx";

// 12:00 IST on 28 Oct 2026, the fixture's own date, so the "today" wording is what shows.
const today = "2026-10-28";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Today", () => {
  it("shows the money in hand, what customers owe and the day's entries", async () => {
    await renderApp(fakeApi(signedInRoutes));

    expect(await screen.findByText("48,250")).toBeInTheDocument();
    const pair = screen.getByText("Online balance").closest("dl");
    expect(pair).toHaveTextContent("₹1,12,400");
    expect(pair).toHaveTextContent("Customers owe₹86,700");
    expect(screen.getByText("With every entry made so far today")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Entries today" })).toBeInTheDocument();
    const day = screen.getByRole("list", { name: "The day's entries" });
    expect(within(day).getByText("Trips").closest("li")).toHaveTextContent("9 trips₹31,500");
    expect(within(day).getByText("Collected from customers").closest("li")).toHaveTextContent(
      "₹14,000 cash, ₹9,500 online, ₹6,000 of it old dues or advances₹23,500",
    );
    expect(within(day).getByText("Spent").closest("li")).toHaveTextContent(
      "Diesel ₹9,850, Labour ₹2,000₹11,850",
    );
    expect(within(day).queryByText(/partner/)).not.toBeInTheDocument();
  });

  it("puts the minus before the rupee sign, in red, when cash in hand is short", async () => {
    const api = fakeApi({
      ...signedInRoutes,
      "GET /dashboard": () => json({ ...DASHBOARD, cashInHandPaise: -2039000 }),
    });

    await renderApp(api);

    const figure = await screen.findByText("−20,390");
    expect(figure).toHaveTextContent(/^−₹20,390$/);
  });

  it("links each customer who owes to their account", async () => {
    await renderApp(fakeApi(signedInRoutes));

    const dues = await screen.findByRole("list", { name: "Customers who owe the most" });
    const ramesh = within(dues).getByRole("link", { name: /Ramesh Bishnoi/ });
    expect(ramesh).toHaveAttribute("href", "/dues/7");
    expect(ramesh).toHaveTextContent("₹18,500");
    expect(ramesh).toHaveTextContent("Oldest due 34 days");
    expect(screen.getByRole("link", { name: "All dues" })).toHaveAttribute("href", "/dues");
  });

  it("flags overdue EMIs and money moved with the partner", async () => {
    const api = fakeApi({
      ...signedInRoutes,
      "GET /dashboard": () =>
        json({
          ...DASHBOARD,
          overdueEmis: 2,
          day: { ...DASHBOARD.day, partnerNetPaidPaise: -500000 },
        }),
    });

    await renderApp(api);

    expect(await screen.findByRole("link", { name: /2 EMIs overdue/ })).toHaveAttribute(
      "href",
      "/tractors",
    );
    expect(screen.getByText("Received from partner").closest("li")).toHaveTextContent("₹5,000");
  });

  it("asks for the business details before showing any figures", async () => {
    const api = fakeApi({
      ...signedInRoutes,
      "GET /settings": () => apiError(404, "NOT_FOUND", "Business settings are not set up yet"),
    });

    await renderApp(api);

    expect(await screen.findByRole("link", { name: "Set up the business" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(api.calls).not.toContain("GET /dashboard");
  });

  it("shows an earlier day when one is picked", async () => {
    const asked: (string | null)[] = [];
    const api = fakeApi({
      ...signedInRoutes,
      "GET /dashboard": (request) => {
        const date = new URL(request.url).searchParams.get("date");
        asked.push(date);
        return json({ ...DASHBOARD, date: date ?? today });
      },
    });
    const { router } = await renderApp(api);
    await screen.findByText("48,250");

    // jsdom cannot type into a date input key by key; the browser tests cover the picker.
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "2026-10-20" } });

    expect(await screen.findByRole("heading", { name: "Tue, 20 Oct 2026" })).toBeInTheDocument();
    expect(await screen.findByText(/At the end of 20 Oct/)).toBeInTheDocument();
    expect(screen.getByText("Customers owe now")).toBeInTheDocument();
    expect(router.state.location.search).toBe("?date=2026-10-20");
    expect(asked.at(-1)).toBe("2026-10-20");
  });

  it.each([
    ["in the future", "2999-01-01"],
    ["that does not exist", "2026-02-31"],
    ["before the business started", "2026-03-31"],
  ])("ignores a day %s and shows today instead", async (_label, date) => {
    const asked: (string | null)[] = [];
    const api = fakeApi({
      ...signedInRoutes,
      "GET /dashboard": (request) => {
        asked.push(new URL(request.url).searchParams.get("date"));
        return json(DASHBOARD);
      },
    });

    await renderApp(api, { path: `/?date=${date}` });

    await screen.findByText("48,250");
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(asked).toEqual([today]);
  });

  it("says what went wrong and loads again on Try again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let failing = true;
    const api = fakeApi({
      ...signedInRoutes,
      "GET /dashboard": () =>
        failing ? apiError(500, "INTERNAL", "Something went wrong") : json(DASHBOARD),
    });
    const { user } = await renderApp(api);

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
    failing = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("48,250")).toBeInTheDocument();
  });
});
