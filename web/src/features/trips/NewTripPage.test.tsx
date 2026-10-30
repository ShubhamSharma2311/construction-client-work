import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ok } from "../../api/types.ts";
import { apiError, fakeApi, json } from "../../test/fake-api.ts";
import { CUSTOMERS, DRIVERS, KHETS, NO_DUES, TRACTORS, TRIP } from "../../test/fixtures.ts";
import { renderApp, signedInRoutes } from "../../test/render.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const saved: Ok<"/trips", "post"> = {
  trip: TRIP,
  customerBalance: { balancePaise: 2200000, duePaise: 2200000, creditPaise: 0 },
  warnings: [],
};

interface Sent {
  body: unknown;
  key: string | null;
}

function newTripApi(answer: () => Response | Promise<Response> = () => json(saved, 201)) {
  const sent: Sent[] = [];
  const api = fakeApi({
    ...signedInRoutes,
    "GET /drivers": () => json(DRIVERS),
    "GET /tractors": () => json(TRACTORS),
    "GET /khets": () => json(KHETS),
    "GET /customers": () => json(CUSTOMERS),
    "GET /dues": () => json(NO_DUES),
    "POST /trips": async (request) => {
      sent.push({ body: await request.json(), key: request.headers.get("idempotency-key") });
      return answer();
    },
  });
  return { api, sent };
}

type User = Awaited<ReturnType<typeof renderApp>>["user"];

async function fillTrip(user: User) {
  await user.click(await screen.findByRole("combobox", { name: "Customer" }));
  await user.click(await screen.findByRole("option", { name: /Ramesh Bishnoi/ }));
  await screen.findByRole("option", { name: "Suresh" });
  await user.selectOptions(screen.getByLabelText("Driver"), "Suresh");
  await user.selectOptions(screen.getByLabelText("Khet"), "Ladnun road");
  await user.type(screen.getByLabelText("Trip amount"), "3500");
}

describe("New trip", () => {
  it("saves the trip once, with how it was paid, and readies the next entry", async () => {
    const { api, sent } = newTripApi();
    const { user } = await renderApp(api, { path: "/new/trip" });

    await fillTrip(user);
    await user.click(screen.getByRole("radio", { name: "Part paid" }));
    await user.type(screen.getByLabelText("Paid now"), "2000");
    expect(screen.getByText("₹1,500 will be left as due.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save trip" }));

    expect(
      await screen.findByText("Trip saved. Ramesh Bishnoi now owes ₹22,000."),
    ).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toEqual({
      tripDate: "2026-10-28",
      customerId: 7,
      driverId: 2,
      tractorId: 3,
      khetId: 4,
      amount: "3500",
      payment: { type: "PARTIAL", paidAmount: "2000", mode: "CASH" },
    });
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    // Ready for the next trip of the same run: customer and amount cleared, the rest kept.
    expect(screen.getByRole("combobox", { name: "Customer" })).toHaveValue("");
    expect(screen.getByLabelText("Trip amount")).toHaveValue("");
    expect(screen.getByLabelText("Driver")).toHaveValue("2");
    expect(screen.getByLabelText("Khet")).toHaveValue("4");
  });

  it("uses a fresh key for the next trip, and the same key when a save is retried", async () => {
    let online = false;
    const { api, sent } = newTripApi(() =>
      online ? json(saved, 201) : Promise.reject(new TypeError("Failed to fetch")),
    );
    const { user } = await renderApp(api, { path: "/new/trip" });
    await fillTrip(user);

    await user.click(screen.getByRole("button", { name: "Save trip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("it will not be entered twice");
    online = true;
    await user.click(screen.getByRole("button", { name: "Save trip" }));
    await screen.findByText(/Trip saved/);
    await fillTrip(user);
    await user.click(screen.getByRole("button", { name: "Save trip" }));

    await vi.waitFor(() => {
      expect(sent).toHaveLength(3);
    });
    expect(sent[1]?.key).toBe(sent[0]?.key);
    expect(sent[2]?.key).not.toBe(sent[0]?.key);
  });

  it("fills in the driver's usual tractor", async () => {
    const { api } = newTripApi();
    const { user } = await renderApp(api, { path: "/new/trip" });

    await screen.findByRole("option", { name: "Bhanwar" });
    await user.selectOptions(screen.getByLabelText("Driver"), "Bhanwar");

    expect(screen.getByLabelText("Tractor")).toHaveValue("4");
    expect(screen.getByText("Bhanwar's usual tractor")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Tractor"), "RJ 21 RA 4412");
    expect(screen.getByText("Bhanwar usually drives RJ 21 RB 1190")).toBeInTheDocument();
  });

  it("names what is missing and sends nothing", async () => {
    const { api, sent } = newTripApi();
    const { user } = await renderApp(api, { path: "/new/trip" });

    await user.click(await screen.findByRole("button", { name: "Save trip" }));

    expect(screen.getByText("Pick the customer, or add a new one")).toBeInTheDocument();
    expect(screen.getByLabelText("Trip amount")).toHaveAttribute("aria-invalid", "true");
    expect(sent).toHaveLength(0);
  });

  it("puts the server's words on the field they are about", async () => {
    const { api } = newTripApi(() =>
      json(
        {
          error: {
            code: "VALIDATION",
            message: "Request is not valid",
            requestId: "r",
            details: {
              issues: [{ path: "body/amount", message: "Amount must be at most ₹10,00,000" }],
            },
          },
        },
        400,
      ),
    );
    const { user } = await renderApp(api, { path: "/new/trip" });
    await fillTrip(user);

    await user.click(screen.getByRole("button", { name: "Save trip" }));

    expect(await screen.findByText("Amount must be at most ₹10,00,000")).toBeInTheDocument();
  });

  it("shows a refusal from the server as it was worded", async () => {
    const { api } = newTripApi(() => apiError(409, "CONFLICT", "Khet Ladnun road is inactive"));
    const { user } = await renderApp(api, { path: "/new/trip" });
    await fillTrip(user);

    await user.click(screen.getByRole("button", { name: "Save trip" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Khet Ladnun road is inactive.");
  });

  it("adds a new customer without leaving the trip", async () => {
    const { api } = newTripApi();
    const created: unknown[] = [];
    const withCreate = fakeApi({
      ...Object.fromEntries(
        [
          "POST /auth/refresh",
          "GET /settings",
          "GET /drivers",
          "GET /tractors",
          "GET /khets",
          "GET /dues",
        ].map((key) => [key, (request: Request) => api.fetch(request)]),
      ),
      "GET /customers": () => json({ ...CUSTOMERS, items: [] }),
      "POST /customers": async (request) => {
        created.push(await request.json());
        return json(
          {
            customer: { ...CUSTOMERS.items[0], id: 9, name: "Gopal Ram", village: "Nimbi" },
            possibleDuplicates: [],
          },
          201,
        );
      },
    });
    const { user } = await renderApp(withCreate, { path: "/new/trip" });

    await user.type(await screen.findByRole("combobox", { name: "Customer" }), "Gopal Ram");
    await user.click(
      await screen.findByRole("option", { name: "+ Add “Gopal Ram” as a new customer" }),
    );
    const panel = screen.getByRole("group", { name: "New customer" });
    await user.type(within(panel).getByLabelText("Village"), "Nimbi");
    await user.click(within(panel).getByRole("button", { name: "Add customer" }));

    expect(await screen.findByText("Gopal Ram added.")).toBeInTheDocument();
    expect(created).toEqual([{ name: "Gopal Ram", village: "Nimbi" }]);
    expect(screen.getByText("Nimbi")).toBeInTheDocument();
  });

  it("picks a customer with the keyboard", async () => {
    const { api } = newTripApi();
    const { user } = await renderApp(api, { path: "/new/trip" });

    await user.click(await screen.findByRole("combobox", { name: "Customer" }));
    await screen.findByRole("option", { name: /Sunil Jat/ });
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByText("Sunil Jat")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Customer" })).not.toBeInTheDocument();
  });
});
