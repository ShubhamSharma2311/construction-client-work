import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { apiError, fakeApi, json, SESSION } from "../test/fake-api.ts";
import { renderApp, signedInRoutes } from "../test/render.tsx";

const signedOut = { "POST /auth/refresh": () => apiError(401, "UNAUTHORIZED", "log in again") };

async function fillAndSubmit(user: Awaited<ReturnType<typeof renderApp>>["user"]) {
  await user.type(screen.getByLabelText("Username"), "owner");
  await user.type(screen.getByLabelText("Password"), "owner-password-1");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("sign in", () => {
  it("sends a signed-out visitor to sign in, then back where they were going", async () => {
    const api = fakeApi({
      ...signedInRoutes,
      ...signedOut,
      "POST /auth/login": () => json(SESSION),
    });
    const { user, router } = await renderApp(api, { path: "/trips?week=this" });
    await screen.findByRole("heading", { name: "Sign in" });
    expect(router.state.location.pathname).toBe("/login");

    await fillAndSubmit(user);

    expect(await screen.findByRole("heading", { name: "Trips" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/trips");
    expect(router.state.location.search).toBe("?week=this");
    expect(api.calls).toContain("POST /auth/login");
  });

  it.each([
    [apiError(401, "UNAUTHORIZED", "x"), "Wrong username or password."],
    [apiError(429, "RATE_LIMITED", "x"), "Too many wrong tries. Wait 15 minutes, then try again."],
    [apiError(400, "VALIDATION", "x"), "Enter both your username and password."],
    [apiError(503, "UNAVAILABLE", "x"), "The server could not sign you in (UNAVAILABLE)."],
  ])("explains a refused sign in (%#)", async (answer, message) => {
    const api = fakeApi({ ...signedOut, "POST /auth/login": () => answer.clone() });
    const { user } = await renderApp(api, { path: "/login" });

    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("says so when the server cannot be reached", async () => {
    const api = fakeApi({
      ...signedOut,
      "POST /auth/login": () => Promise.reject(new TypeError("Failed to fetch")),
    });
    const { user } = await renderApp(api, { path: "/login" });

    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach the server");
  });

  it.each(["//evil.example/steal", "https://evil.example", 42])(
    "goes to Today instead of an address outside the app (%s)",
    async (from) => {
      const api = fakeApi({
        ...signedInRoutes,
        ...signedOut,
        "POST /auth/login": () => json(SESSION),
      });
      const { user, router } = await renderApp(api, {
        path: { pathname: "/login", state: { from } },
      });

      await fillAndSubmit(user);

      await screen.findByRole("heading", { name: "Today" });
      expect(router.state.location.pathname).toBe("/");
    },
  );

  it("skips the form for someone already signed in", async () => {
    const api = fakeApi(signedInRoutes);
    const { router } = await renderApp(api, { path: "/login" });

    await screen.findByRole("heading", { name: "Today" });
    expect(router.state.location.pathname).toBe("/");
  });
});
