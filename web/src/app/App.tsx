import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { RouterProvider } from "react-router";
import type { Session } from "../auth/session.ts";
import type { createBrowserRouter } from "react-router";
import type { Services } from "./services.ts";
import { ServicesProvider } from "./ServicesContext.tsx";

type Router = ReturnType<typeof createBrowserRouter>;

/** Whoever signs in next must see nothing cached from the last session. */
function useClearCacheWhenSignedOut(session: Session, queryClient: QueryClient) {
  useEffect(
    () =>
      session.subscribe(() => {
        if (session.getStatus() === "signed-out") queryClient.clear();
      }),
    [session, queryClient],
  );
}

export function App({
  services,
  queryClient,
  router,
}: {
  services: Services;
  queryClient: QueryClient;
  router: Router;
}) {
  useClearCacheWhenSignedOut(services.session, queryClient);
  return (
    <ServicesProvider services={services}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ServicesProvider>
  );
}
