import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { apiError, fakeApi } from "../test/fake-api.ts";
import { renderApp } from "../test/render.tsx";

const signedOut = { "POST /auth/refresh": () => apiError(401, "UNAUTHORIZED", "log in again") };
const noContent = () => new Response(null, { status: 204 });

describe("forgot password", () => {
  it("is offered on sign in and emails a link for the username", async () => {
    const sent: unknown[] = [];
    const api = fakeApi({
      ...signedOut,
      "POST /auth/forgot-password": async (request) => {
        sent.push(await request.json());
        return noContent();
      },
    });
    const { user, router } = await renderApp(api, { path: "/login" });

    await user.click(await screen.findByRole("link", { name: "Forgot password?" }));
    expect(router.state.location.pathname).toBe("/forgot-password");
    await user.click(screen.getByRole("button", { name: "Email me a link" }));
    expect(screen.getByText("Enter your username")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Username"), "owner");
    await user.click(screen.getByRole("button", { name: "Email me a link" }));

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByText(/If owner has an email set/)).toBeInTheDocument();
    expect(sent).toEqual([{ username: "owner" }]);
  });

  it("passes on the server's reason when it cannot send", async () => {
    const api = fakeApi({
      ...signedOut,
      "POST /auth/forgot-password": () =>
        apiError(429, "RATE_LIMITED", "Too many reset emails; try again in an hour"),
    });
    const { user } = await renderApp(api, { path: "/forgot-password" });

    await user.type(await screen.findByLabelText("Username"), "owner");
    await user.click(screen.getByRole("button", { name: "Email me a link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many reset emails; try again in an hour.",
    );
  });
});

describe("choosing a new password from the emailed link", () => {
  it("checks the two passwords match, then saves and offers sign in", async () => {
    const sent: unknown[] = [];
    const api = fakeApi({
      ...signedOut,
      "POST /auth/reset-password": async (request) => {
        sent.push(await request.json());
        return noContent();
      },
    });
    const { user } = await renderApp(api, { path: "/reset-password?token=abc123" });

    await user.type(await screen.findByLabelText("New password"), "a-brand-new-password");
    await user.type(screen.getByLabelText("New password again"), "a-different-password");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(screen.getByText("The two new passwords are not the same")).toBeInTheDocument();
    expect(sent).toHaveLength(0);

    await user.clear(screen.getByLabelText("New password again"));
    await user.type(screen.getByLabelText("New password again"), "a-brand-new-password");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByRole("heading", { name: "Password changed" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(sent).toEqual([{ token: "abc123", newPassword: "a-brand-new-password" }]);
  });

  it("explains an expired link and offers a new one", async () => {
    const api = fakeApi({
      ...signedOut,
      "POST /auth/reset-password": () =>
        apiError(
          400,
          "VALIDATION",
          "This reset link has expired or was already used; ask for a new one",
        ),
    });
    const { user } = await renderApp(api, { path: "/reset-password?token=old" });

    await user.type(await screen.findByLabelText("New password"), "a-brand-new-password");
    await user.type(screen.getByLabelText("New password again"), "a-brand-new-password");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("expired or was already used");
    expect(screen.getByRole("link", { name: "Ask for a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("does not blame the link when the server fails", async () => {
    const api = fakeApi({
      ...signedOut,
      "POST /auth/reset-password": () => apiError(500, "INTERNAL", "Something went wrong"),
    });
    const { user } = await renderApp(api, { path: "/reset-password?token=abc123" });

    await user.type(await screen.findByLabelText("New password"), "a-brand-new-password");
    await user.type(screen.getByLabelText("New password again"), "a-brand-new-password");
    await user.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.queryByRole("link", { name: "Ask for a new link" })).not.toBeInTheDocument();
  });

  it("says a link with no token is incomplete", async () => {
    await renderApp(fakeApi(signedOut), { path: "/reset-password" });

    expect(
      await screen.findByRole("heading", { name: "This link is incomplete" }),
    ).toBeInTheDocument();
  });
});
