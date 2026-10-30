import { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, type InitialEntry } from "react-router";
import { App } from "../app/App.tsx";
import { routes } from "../app/routes.tsx";
import { createServices } from "../app/services.ts";
import { ServicesProvider } from "../app/ServicesContext.tsx";
import { ToastProvider } from "../app/Toast.tsx";
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

export const DASHBOARD: Ok<"/dashboard", "get"> = {
  date: "2026-10-28",
  day: {
    trips: 9,
    revenuePaise: 3150000,
    cashInPaise: 1400000,
    onlineInPaise: 950000,
    newDuesPaise: 800000,
    duesRecoveredPaise: 600000,
    expensesPaise: 1185000,
    driverPaymentsPaise: 200000,
    partnerNetPaidPaise: 0,
  },
  expensesByCategory: { DIESEL: 985000, LABOUR: 200000 },
  cashInHandPaise: 4825000,
  onlineBalancePaise: 11240000,
  totalDuesPaise: 8670000,
  overdueEmis: 0,
  topDues: [
    {
      customer: { id: 7, name: "Ramesh Bishnoi" },
      balancePaise: 1850000,
      oldestDueDate: "2026-09-24",
    },
  ],
};

/** Handlers a signed-in app always needs: a good refresh cookie, settings, the Today screen. */
export const signedInRoutes = {
  "POST /auth/refresh": () => json(SESSION),
  "GET /settings": () => json(SETTINGS),
  "GET /dashboard": () => json(DASHBOARD),
};

/** One component on its own, with the services, cache and toasts it may use. */
export async function renderPart(ui: ReactNode, api: FakeApi) {
  const services = createServices({ baseUrl: BASE_URL, fetch: api.fetch });
  await services.session.restore();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  const view = render(
    <ServicesProvider services={services}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </ServicesProvider>,
  );
  return { ...view, user, queryClient };
}
