import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { apiError, fakeApi } from "../test/fake-api.ts";
import { renderApp, signedInRoutes } from "../test/render.tsx";
import { MORE_ITEMS, NAV_GROUPS, NEW_ENTRIES } from "./nav.ts";

describe("app frame", () => {
  it("shows the business name from settings", async () => {
    await renderApp(fakeApi(signedInRoutes));

    expect(await screen.findAllByText("Godara Sand Supply")).toHaveLength(2);
  });

  it("uses the app's name until the business is set up", async () => {
    const api = fakeApi({
      ...signedInRoutes,
      "GET /settings": () => apiError(404, "NOT_FOUND", "Business settings are not set up yet"),
    });

    await renderApp(api);

    expect(await screen.findAllByText("Sand Trip Ledger")).toHaveLength(2);
  });

  it("says so when the settings cannot be loaded, instead of quietly using the app's name", async () => {
    const api = fakeApi({
      ...signedInRoutes,
      "GET /settings": () => apiError(500, "INTERNAL", "Something went wrong"),
    });

    await renderApp(api);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load the business settings.",
    );
  });

  it("lists every screen in the side menu and marks the current one", async () => {
    await renderApp(fakeApi(signedInRoutes), { path: "/drivers" });

    const menu = await screen.findByRole("navigation", { name: "Main" });
    const labels = within(menu)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(labels).toEqual(NAV_GROUPS.flatMap((group) => group.items.map((item) => item.label)));
    expect(within(menu).getByRole("link", { name: "Drivers" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("gives the phone tabs Today, Trips, Customers and More, with New entry between", async () => {
    await renderApp(fakeApi(signedInRoutes));

    const tabs = await screen.findByRole("navigation", { name: "Tabs" });
    expect(Array.from(tabs.children, (child) => child.textContent)).toEqual([
      "Today",
      "Trips",
      "+ New",
      "Customers",
      "More",
    ]);
  });

  it("opens New entry with every kind of entry and goes to the one picked", async () => {
    const { user, router } = await renderApp(fakeApi(signedInRoutes));

    await user.click(await screen.findByRole("button", { name: "New entry" }));
    const dialog = screen.getByRole("dialog", { name: "New entry" });
    expect(within(dialog).getByRole("heading", { name: "New entry" })).toHaveFocus();
    expect(within(dialog).getAllByRole("link")).toHaveLength(NEW_ENTRIES.length);
    await user.click(within(dialog).getByRole("link", { name: /Diesel/ }));

    expect(router.state.location.pathname).toBe("/new/diesel");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes New entry without going anywhere", async () => {
    const { user, router } = await renderApp(fakeApi(signedInRoutes));

    await user.click(await screen.findByRole("button", { name: "+ New" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });

  it("answers an unknown address with a way back", async () => {
    await renderApp(fakeApi(signedInRoutes), { path: "/no-such-screen" });

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Today" })).toHaveAttribute("href", "/");
  });

  it("lists on More every screen the phone tabs leave out", async () => {
    await renderApp(fakeApi(signedInRoutes), { path: "/more" });

    const list = await screen.findByRole("list", { name: "Other screens" });
    expect(
      within(list)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(MORE_ITEMS.map((item) => item.label));
    expect(MORE_ITEMS.map((item) => item.to)).not.toContain("/trips");
  });
});
