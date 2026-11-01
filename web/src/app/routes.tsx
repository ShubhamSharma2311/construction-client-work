import type { ReactNode } from "react";
import type { RouteObject } from "react-router";
import { LoginPage } from "../auth/LoginPage.tsx";
import { ForgotPasswordPage } from "../auth/ForgotPasswordPage.tsx";
import { ResetPasswordPage } from "../auth/ResetPasswordPage.tsx";
import { RequireAuth } from "../auth/RequireAuth.tsx";
import { CustomerAccountPage } from "../features/customers/CustomerAccountPage.tsx";
import { DriverPage } from "../features/drivers/DriverPage.tsx";
import { DriversPage } from "../features/drivers/DriversPage.tsx";
import { NewDriverPaymentPage } from "../features/drivers/NewDriverPaymentPage.tsx";
import { DuesPage } from "../features/dues/DuesPage.tsx";
import { NewPartnerTxnPage } from "../features/partner/NewPartnerTxnPage.tsx";
import { PartnerByIdPage, PartnersPage } from "../features/partner/PartnerPage.tsx";
import { EditExpensePage, ExpensePage } from "../features/expenses/ExpensePage.tsx";
import { ExpensesPage } from "../features/expenses/ExpensesPage.tsx";
import {
  NewDieselPage,
  NewGeneralExpensePage,
  NewServicePage,
} from "../features/expenses/NewExpensePage.tsx";
import { NewPaymentPage } from "../features/payments/NewPaymentPage.tsx";
import { PaymentPage } from "../features/payments/PaymentPage.tsx";
import { LoanPage } from "../features/tractors/LoanPage.tsx";
import { NewEmiPage } from "../features/tractors/NewEmiPage.tsx";
import { TractorPage } from "../features/tractors/TractorPage.tsx";
import { TractorsPage } from "../features/tractors/TractorsPage.tsx";
import { ReportsPage } from "../features/reports/ReportsPage.tsx";
import { SettingsPage } from "../features/settings/SettingsPage.tsx";
import { SetupPage } from "../features/setup/SetupPage.tsx";
import { TodayPage } from "../features/today/TodayPage.tsx";
import { EditTripPage } from "../features/trips/EditTripPage.tsx";
import { NewTripPage } from "../features/trips/NewTripPage.tsx";
import { TripPage } from "../features/trips/TripPage.tsx";
import { TripsPage } from "../features/trips/TripsPage.tsx";
import { MorePage } from "../pages/MorePage.tsx";
import { NotFoundPage } from "../pages/NotFoundPage.tsx";
import { AppShell } from "../shell/AppShell.tsx";
import { type Destination, NAV_GROUPS, NEW_ENTRIES } from "../shell/nav.ts";
import { WithId } from "./WithId.tsx";

// The screen behind each menu destination.
const SCREENS: Record<string, RouteObject> = {
  "/": { index: true, element: <TodayPage /> },
  "/trips": { path: "/trips", element: <TripsPage /> },
  "/new/trip": { path: "/new/trip", element: <NewTripPage /> },
  "/dues": { path: "/dues", element: <DuesPage /> },
  "/new/payment": { path: "/new/payment", element: <NewPaymentPage /> },
  "/expenses": { path: "/expenses", element: <ExpensesPage /> },
  "/new/expense": { path: "/new/expense", element: <NewGeneralExpensePage /> },
  "/new/diesel": { path: "/new/diesel", element: <NewDieselPage /> },
  "/new/service": { path: "/new/service", element: <NewServicePage /> },
  "/tractors": { path: "/tractors", element: <TractorsPage /> },
  "/new/emi": { path: "/new/emi", element: <NewEmiPage /> },
  "/drivers": { path: "/drivers", element: <DriversPage /> },
  "/partner": { path: "/partner", element: <PartnersPage /> },
  "/reports": { path: "/reports", element: <ReportsPage /> },
  "/setup": { path: "/setup", element: <SetupPage /> },
  "/settings": { path: "/settings", element: <SettingsPage /> },
  "/new/partner": { path: "/new/partner", element: <NewPartnerTxnPage /> },
  "/new/driver-payment": { path: "/new/driver-payment", element: <NewDriverPaymentPage /> },
};

/** A screen for one entry; the key starts it afresh when the address moves to another. */
function detail(path: string, render: (id: number) => ReactNode): RouteObject {
  return { path, element: <WithId render={render} /> };
}

// Screens reached from a list rather than the menu.
const DETAILS: RouteObject[] = [
  detail("/trips/:id", (id) => <TripPage key={id} id={id} />),
  detail("/trips/:id/edit", (id) => <EditTripPage key={id} id={id} />),
  detail("/dues/:id", (id) => <CustomerAccountPage key={id} id={id} />),
  detail("/payments/:id", (id) => <PaymentPage key={id} id={id} />),
  detail("/expenses/:id", (id) => <ExpensePage key={id} id={id} />),
  detail("/expenses/:id/edit", (id) => <EditExpensePage key={id} id={id} />),
  detail("/tractors/:id", (id) => <TractorPage key={id} id={id} />),
  detail("/loans/:id", (id) => <LoanPage key={id} id={id} />),
  detail("/drivers/:id", (id) => <DriverPage key={id} id={id} />),
  detail("/partner/:id", (id) => <PartnerByIdPage key={id} id={id} />),
];

function screenFor({ to }: Destination): RouteObject {
  const screen = SCREENS[to];
  // A menu item with no screen is a wiring mistake; failing at start shows it at once.
  if (!screen) throw new Error(`No screen for the menu destination ${to}`);
  return screen;
}

export const routes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: "/",
        element: <AppShell />,
        children: [
          ...NAV_GROUPS.flatMap((group) => group.items).map(screenFor),
          ...NEW_ENTRIES.map(screenFor),
          ...DETAILS,
          { path: "more", element: <MorePage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
