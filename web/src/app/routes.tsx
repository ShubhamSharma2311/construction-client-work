import type { RouteObject } from "react-router";
import { LoginPage } from "../auth/LoginPage.tsx";
import { RequireAuth } from "../auth/RequireAuth.tsx";
import { TodayPage } from "../features/today/TodayPage.tsx";
import { EditTripPage } from "../features/trips/EditTripPage.tsx";
import { NewTripPage } from "../features/trips/NewTripPage.tsx";
import { TripPage } from "../features/trips/TripPage.tsx";
import { TripsPage } from "../features/trips/TripsPage.tsx";
import { MorePage } from "../pages/MorePage.tsx";
import { NotBuiltYet } from "../pages/NotBuiltYet.tsx";
import { NotFoundPage } from "../pages/NotFoundPage.tsx";
import { AppShell } from "../shell/AppShell.tsx";
import { type Destination, NAV_GROUPS, NEW_ENTRIES } from "../shell/nav.ts";
import { WithId } from "./WithId.tsx";

// Screens that exist; every other menu destination is a placeholder until its block lands.
const BUILT: Record<string, RouteObject> = {
  "/": { index: true, element: <TodayPage /> },
  "/trips": { path: "/trips", element: <TripsPage /> },
  "/new/trip": { path: "/new/trip", element: <NewTripPage /> },
};

// Screens reached from a list rather than the menu.
const DETAILS: RouteObject[] = [
  { path: "/trips/:id", element: <WithId render={(id) => <TripPage key={id} id={id} />} /> },
  {
    path: "/trips/:id/edit",
    element: <WithId render={(id) => <EditTripPage key={id} id={id} />} />,
  },
];

function screenFor({ to, label }: Destination): RouteObject {
  return BUILT[to] ?? { path: to, element: <NotBuiltYet title={label} /> };
}

export const routes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
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
