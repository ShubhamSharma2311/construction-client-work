import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, fakeApi, json } from "../../test/fake-api.ts";
import { renderApp, SETTINGS, signedInRoutes } from "../../test/render.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

type Handler = (request: Request) => Response | Promise<Response>;

const NO_HISTORY = { items: [], total: 0, page: 1, limit: 30 };

function settingsApi(extra: Record<string, Handler> = {}) {
  return fakeApi({ ...signedInRoutes, ...extra });
}

describe("Business settings", () => {
  it("saves the business with its opening money in rupees", async () => {
    const sent: unknown[] = [];
    const api = settingsApi({
      "PUT /settings": async (request) => {
        sent.push(await request.json());
        return json({ ...SETTINGS, openingCashPaise: 1250050 });
      },
    });
    const { user } = await renderApp(api, { path: "/settings" });

    const cash = await screen.findByLabelText("Cash in hand that day");
    expect(screen.getByLabelText("Business name")).toHaveValue("Godara Sand Supply");
    await user.clear(cash);
    await user.type(cash, "12500.50");
    await user.clear(screen.getByLabelText("Money in the bank that day"));
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
    expect(sent).toEqual([
      {
        businessName: "Godara Sand Supply",
        businessStartDate: "2026-04-01",
        openingCash: "12500.50",
        openingOnline: "0",
      },
    ]);
  });

  it("shows why a later start date is refused", async () => {
    const api = settingsApi({
      "PUT /settings": () =>
        apiError(409, "CONFLICT", "Entries exist from 2026-04-03, before the new start date"),
    });
    const { user } = await renderApp(api, { path: "/settings" });

    await user.click(await screen.findByRole("button", { name: "Save settings" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Entries exist from 2026-04-03, before the new start date.",
    );
  });

  it("sets up a new business, with only the form to fill", async () => {
    let saved = false;
    const api = settingsApi({
      "GET /settings": () => (saved ? json(SETTINGS) : json(null, 404)),
      "PUT /settings": () => {
        saved = true;
        return json(SETTINGS);
      },
    });
    const { user } = await renderApp(api, { path: "/settings" });

    expect(await screen.findByRole("heading", { name: "Set up the business" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Show" })).toBeNull();
    await user.type(screen.getByLabelText("Business name"), "Godara Sand Supply");
    await user.click(screen.getByRole("button", { name: "Set up the business" }));

    expect(
      await screen.findByText("Business set up. Every total counts from here."),
    ).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });
});

describe("Changing the password", () => {
  it("checks the new password before sending, then signs out", async () => {
    const sent: unknown[] = [];
    let signedOut = false;
    const api = settingsApi({
      "POST /auth/change-password": async (request) => {
        sent.push(await request.json());
        return new Response(null, { status: 204 });
      },
      "POST /auth/logout": () => {
        signedOut = true;
        return new Response(null, { status: 204 });
      },
    });
    const { user, router } = await renderApp(api, { path: "/settings?view=password" });

    await user.type(await screen.findByLabelText("Current password"), "old-password-1");
    await user.type(screen.getByLabelText("New password"), "short");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByText("Use at least 10 characters")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("New password"));
    await user.type(screen.getByLabelText("New password"), "new-password-22");
    await user.type(screen.getByLabelText("New password again"), "new-password-23");
    expect(screen.getByText("The two new passwords are not the same")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("New password again"));
    await user.type(screen.getByLabelText("New password again"), "new-password-22");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(
      await screen.findByText("Password changed. Sign in with the new one."),
    ).toBeInTheDocument();
    expect(sent).toEqual([{ currentPassword: "old-password-1", newPassword: "new-password-22" }]);
    expect(signedOut).toBe(true);
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
  });

  it("says when the current password is wrong, and stays signed in", async () => {
    const api = settingsApi({
      "POST /auth/change-password": () => apiError(400, "VALIDATION", "Current password is wrong"),
    });
    const { user } = await renderApp(api, { path: "/settings?view=password" });

    await user.type(await screen.findByLabelText("Current password"), "guess-password");
    await user.type(screen.getByLabelText("New password"), "new-password-22");
    await user.type(screen.getByLabelText("New password again"), "new-password-22");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Current password is wrong");
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });
});

describe("Deleted entries and history", () => {
  it("links to the deleted trips and expenses, where each is restored", async () => {
    const { user } = await renderApp(settingsApi(), { path: "/settings" });

    await user.click(await screen.findByRole("button", { name: "Deleted entries" }));

    const list = screen.getByRole("list", { name: "Deleted entries" });
    expect(within(list).getByRole("link", { name: "Deleted trips" })).toHaveAttribute(
      "href",
      "/trips?deleted=true&range=all",
    );
    expect(within(list).getByRole("link", { name: "Deleted expenses" })).toHaveAttribute(
      "href",
      "/expenses?deleted=true&range=all",
    );
  });

  it("lists changes to trips, newest first, saying what each edit changed", async () => {
    const asked: string[] = [];
    const api = settingsApi({
      "GET /audit": (request) => {
        const entity = new URL(request.url).searchParams.get("entity") ?? "";
        asked.push(entity);
        if (entity !== "Trip") return json(NO_HISTORY);
        return json({
          ...NO_HISTORY,
          total: 2,
          items: [
            {
              id: "9",
              entity: "Trip",
              entityId: "43",
              action: "UPDATE",
              before: { amountPaise: 350000 },
              after: { amountPaise: 300000 },
              at: "2026-10-28T05:00:00.000Z",
            },
            {
              id: "8",
              entity: "Trip",
              entityId: "43",
              action: "CREATE",
              before: null,
              after: { amountPaise: 350000 },
              at: "2026-10-27T05:00:00.000Z",
            },
          ],
        });
      },
    });
    const { user } = await renderApp(api, { path: "/settings?view=history" });

    const list = await screen.findByRole("list", { name: "History of trips" });
    const changed = within(list).getByRole("link", { name: /Changed trip #43/ });
    expect(changed).toHaveAttribute("href", "/trips/43");
    expect(changed).toHaveTextContent("28 Oct, 10:30 am; Amount: ₹3,500 → ₹3,000");
    expect(within(list).getByRole("link", { name: /Added trip #43/ })).toHaveTextContent(
      "Amount: ₹3,500",
    );

    await user.selectOptions(screen.getByLabelText("Show changes to"), "Khet");

    expect(await screen.findByText("No khets changed yet.")).toBeInTheDocument();
    expect(asked).toEqual(["Trip", "Khet"]);
  });
});
