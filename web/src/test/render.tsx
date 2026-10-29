import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, type InitialEntry } from "react-router";
import { App } from "../app/App.tsx";
import { routes } from "../app/routes.tsx";
import { createServices } from "../app/services.ts";
import { BASE_URL, type FakeApi, json, type Ok, SESSION } from "./fake-api.ts";

export interface RenderOptions {
  path?: InitialEntry;
  /** Check the saved sign in before rendering, as the real app does on start. */
  restore?: boolean;
}

/** The whole app at one address, talking to a fake backend. */
export async function renderApp(api: FakeApi, { path = "/", restore = true }: RenderOptions = {}) {
  const services = createServices({ baseUrl: BASE_URL, fetch: api.fetch });
  if (restore) await services.session.restore();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  const view = render(<App services={services} queryClient={queryClient} router={router} />);
  return { ...view, user, router, services, queryClient };
}

export const SETTINGS: Ok<"/settings", "get"> = {
  businessName: "Godara Sand Supply",
  businessStartDate: "2026-04-01",
  openingCashPaise: 0,
  openingOnlinePaise: 0,
};

/** Handlers a signed-in app always needs: a good refresh cookie and saved settings. */
export const signedInRoutes = {
  "POST /auth/refresh": () => json(SESSION),
  "GET /settings": () => json(SETTINGS),
};
