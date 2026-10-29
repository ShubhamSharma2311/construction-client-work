import type { RouteObject } from "react-router";
import { LoginPage } from "../auth/LoginPage.tsx";
import { RequireAuth } from "../auth/RequireAuth.tsx";
import { MorePage } from "../pages/MorePage.tsx";
import { NotBuiltYet } from "../pages/NotBuiltYet.tsx";
import { NotFoundPage } from "../pages/NotFoundPage.tsx";
import { AppShell } from "../shell/AppShell.tsx";
import { type Destination, NAV_GROUPS, NEW_ENTRIES } from "../shell/nav.ts";

// Each later block swaps one of these placeholders for its real screen.
function placeholder({ to, label }: Destination): RouteObject {
  const element = <NotBuiltYet title={label} />;
  return to === "/" ? { index: true, element } : { path: to, element };
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
          ...NAV_GROUPS.flatMap((group) => group.items).map(placeholder),
          ...NEW_ENTRIES.map(placeholder),
          { path: "more", element: <MorePage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
