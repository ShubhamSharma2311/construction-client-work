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

function categoryOf(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "category" in body &&
    typeof body.category === "string"
  ) {
    return body.category;
  }
  throw new Error("expense body has no category");
}

function newExpenseApi(warnings: string[] = [], failFirst = false) {
  const sent: { body: unknown; key: string | null }[] = [];
  let failing = failFirst;
  const api = fakeApi({
    ...signedInRoutes,
    "GET /tractors": () => json(TRACTORS),
    "GET /drivers": () => json(DRIVERS),
    "GET /labourers": () => json(LABOURERS),
    "POST /expenses": async (request) => {
      const body: unknown = await request.json();
      sent.push({ body, key: request.headers.get("idempotency-key") });
      if (failing) {
        failing = false;
        throw new TypeError("Failed to fetch");
      }
      return json({ expense: { ...EXPENSE, category: categoryOf(body) }, warnings }, 201);
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

  it("points to Khets and labour when no labourer is in use", async () => {
    const api = fakeApi({
      ...signedInRoutes,
      "GET /tractors": () => json(TRACTORS),
      "GET /drivers": () => json(DRIVERS),
      "GET /labourers": () =>
        json({ ...LABOURERS, items: [{ ...LABOURERS.items[0], isActive: false }] }),
    });

    await renderApp(api, { path: "/new/expense" });

    expect(
      await screen.findByRole("link", {
        name: "Add one, or turn one back on, under Khets and labour.",
      }),
    ).toHaveAttribute("href", "/setup");
    expect(screen.getByText(/No labourers in use/)).toBeInTheDocument();
  });

  it("reuses the key when a save is retried, and takes a new one for the next expense", async () => {
    const { api, sent } = newExpenseApi([], true);
    const { user } = await renderApp(api, { path: "/new/expense" });
    await screen.findByRole("option", { name: "Mangilal" });
    await user.selectOptions(screen.getByLabelText("Paid to"), "Mangilal");
    await user.type(screen.getByLabelText("Amount paid"), "500");

    await user.click(screen.getByRole("button", { name: "Save expense" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("will not be entered twice");
    await user.click(screen.getByRole("button", { name: "Save expense" }));
    await screen.findByText(/saved/);
    await user.selectOptions(screen.getByLabelText("Paid to"), "Mangilal");
    await user.type(screen.getByLabelText("Amount paid"), "300");
    await user.click(screen.getByRole("button", { name: "Save expense" }));

    await vi.waitFor(() => {
      expect(sent).toHaveLength(3);
    });
    expect(sent[1]?.key).toBe(sent[0]?.key);
    expect(sent[2]?.key).not.toBe(sent[0]?.key);
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
