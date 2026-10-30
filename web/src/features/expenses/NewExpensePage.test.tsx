import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, json } from "../../test/fake-api.ts";
import { DRIVERS, EXPENSE, LABOURERS, TRACTORS } from "../../test/fixtures.ts";
import { renderApp, signedInRoutes } from "../../test/render.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function newExpenseApi(warnings: string[] = []) {
  const sent: { body: unknown; key: string | null }[] = [];
  const api = fakeApi({
    ...signedInRoutes,
    "GET /tractors": () => json(TRACTORS),
    "GET /drivers": () => json(DRIVERS),
    "GET /labourers": () => json(LABOURERS),
    "POST /expenses": async (request) => {
      const body = (await request.json()) as { category: string };
      sent.push({ body, key: request.headers.get("idempotency-key") });
      return json({ expense: { ...EXPENSE, category: body.category }, warnings }, 201);
    },
  });
  return { api, sent };
}

describe("New expense", () => {
  it("pays a labourer and readies the next expense", async () => {
    const { api, sent } = newExpenseApi();
    const { user } = await renderApp(api, { path: "/new/expense" });

    await screen.findByRole("option", { name: "Mangilal" });
    await user.selectOptions(screen.getByLabelText("Paid to"), "Mangilal");
    await user.type(screen.getByLabelText("Amount paid"), "500");
    await user.click(screen.getByRole("button", { name: "Save expense" }));

    expect(await screen.findByText(/Labour of ₹4,500 saved/)).toBeInTheDocument();
    expect(sent[0]?.body).toEqual({
      category: "LABOUR",
      spentOn: "2026-10-28",
      amount: "500",
      mode: "CASH",
      labourerId: 11,
    });
    expect(screen.getByLabelText("Amount paid")).toHaveValue("");
    expect(screen.getByLabelText("Kind of expense")).toHaveValue("LABOUR");
  });

  it("asks police money for who and why", async () => {
    const { api, sent } = newExpenseApi();
    const { user } = await renderApp(api, { path: "/new/expense" });

    await user.selectOptions(await screen.findByLabelText("Kind of expense"), "Police");
    await user.type(screen.getByLabelText("Amount paid"), "1000");
    await user.click(screen.getByRole("button", { name: "Save expense" }));

    expect(screen.getByText("Say who it was paid to and why")).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("fills diesel's driver from the tractor, shows the price a litre, and passes on warnings", async () => {
    const { api, sent } = newExpenseApi(["₹200 a litre is unusual; check the amount"]);
    const { user } = await renderApp(api, { path: "/new/diesel" });

    await screen.findByRole("option", { name: "RJ 21 RA 4412" });
    await user.selectOptions(screen.getByLabelText("Tractor"), "RJ 21 RA 4412");
    expect(screen.getByLabelText("Driver")).toHaveValue("2");
    await user.type(screen.getByLabelText("Litres"), "47.5");
    await user.type(screen.getByLabelText("Amount paid"), "4500");
    expect(screen.getByText("₹94.74 a litre")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save expense" }));

    expect(
      await screen.findByText("₹200 a litre is unusual; check the amount"),
    ).toBeInTheDocument();
    expect(sent[0]?.body).toEqual({
      category: "DIESEL",
      spentOn: "2026-10-28",
      amount: "4500",
      mode: "CASH",
      tractorId: 3,
      driverId: 2,
      litres: "47.5",
    });
  });

  it("asks a service for the work done", async () => {
    const { api } = newExpenseApi();
    const { user } = await renderApp(api, { path: "/new/service" });

    await user.click(await screen.findByRole("button", { name: "Save expense" }));

    expect(screen.getByText("Say what work was done")).toBeInTheDocument();
    expect(screen.getByText("Pick the tractor")).toBeInTheDocument();
  });
});
