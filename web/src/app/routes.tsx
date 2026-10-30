import type { RouteObject } from "react-router";
import { LoginPage } from "../auth/LoginPage.tsx";
import { RequireAuth } from "../auth/RequireAuth.tsx";
import { TodayPage } from "../features/today/TodayPage.tsx";
import { MorePage } from "../pages/MorePage.tsx";
import { NotBuiltYet } from "../pages/NotBuiltYet.tsx";
import { NotFoundPage } from "../pages/NotFoundPage.tsx";
import { AppShell } from "../shell/AppShell.tsx";
import { type Destination, NAV_GROUPS, NEW_ENTRIES } from "../shell/nav.ts";

// Screens that exist; every other menu destination is a placeholder until its block lands.
const BUILT: Record<string, RouteObject> = {
  "/": { index: true, element: <TodayPage /> },
};

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
          { path: "more", element: <MorePage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
