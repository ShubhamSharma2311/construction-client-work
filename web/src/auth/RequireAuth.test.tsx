import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, fakeApi, json, SESSION } from "../test/fake-api.ts";
import { renderApp, signedInRoutes } from "../test/render.tsx";

describe("opening the app", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("waits quietly while it checks the saved sign in", async () => {
    await renderApp(fakeApi(signedInRoutes), { restore: false });

    expect(screen.getByText("Opening your ledger…")).toBeInTheDocument();
  });

  it.each([
    [
      "cannot be reached",
      () => Promise.reject(new TypeError("Failed to fetch")),
      "Cannot reach the server. Check the internet connection.",
    ],
    [
      "has a problem",
      () => Promise.resolve(apiError(503, "UNAVAILABLE", "database down")),
      "The server had a problem. Try again in a minute.",
    ],
  ])("says so when the server %s, and recovers on Try again", async (_label, failing, message) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let healthy = false;
    const api = fakeApi({
      ...signedInRoutes,
      "POST /auth/refresh": () => (healthy ? json(SESSION) : failing()),
    });
    const { user } = await renderApp(api);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    healthy = true;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
  });
});
