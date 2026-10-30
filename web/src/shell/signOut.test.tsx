import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { apiError, BASE_URL, fakeApi, json, SESSION } from "../test/fake-api.ts";
import { renderApp, signedInRoutes } from "../test/render.tsx";

describe("signing out", () => {
  it.each([
    [
      "the More screen",
      "/more",
      () => within(screen.getByRole("main")).getByRole("button", { name: "Sign out" }),
    ],
    [
      "the side menu",
      "/",
      // On Today, the side menu holds the only Sign out button.
      () => screen.getByRole("button", { name: "Sign out" }),
    ],
  ])("from %s ends the session and shows sign in", async (_label, path, findButton) => {
    const api = fakeApi({
      ...signedInRoutes,
      "POST /auth/logout": () => new Response(null, { status: 204 }),
    });
    const { user, router, queryClient } = await renderApp(api, { path });
    await screen.findAllByText("Godara Sand Supply");

    await user.click(findButton());

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("drops cached screens when the session runs out, not only on Sign out", async () => {
    let expired = false;
    const api = fakeApi({
      ...signedInRoutes,
      "POST /auth/refresh": () =>
        expired ? apiError(401, "UNAUTHORIZED", "log in again") : json(SESSION),
      "GET /auth/me": () => apiError(401, "UNAUTHORIZED", "expired"),
    });
    const { services, queryClient } = await renderApp(api);
    await screen.findAllByText("Godara Sand Supply");
    expect(queryClient.getQueryData(["settings"])).toBeDefined();

    expired = true;
    await services.session.authFetch(new Request(`${BASE_URL}/auth/me`));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("says so, and stays signed in, when sign out fails", async () => {
    const api = fakeApi({
      ...signedInRoutes,
      "POST /auth/logout": () => apiError(500, "INTERNAL", "boom"),
    });
    const { user } = await renderApp(api, { path: "/more" });

    const main = screen.getByRole("main");
    await user.click(await within(main).findByRole("button", { name: "Sign out" }));

    expect(
      await within(main).findByText("Could not sign out. Check the connection."),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "More" })).toBeInTheDocument();
  });
});
