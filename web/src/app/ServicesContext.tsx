import { createContext, type ReactNode, useContext, useSyncExternalStore } from "react";
import type { SessionStatus } from "../auth/session.ts";
import type { Services } from "./services.ts";

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  services: Services;
  children: ReactNode;
}) {
  return <ServicesContext value={services}>{children}</ServicesContext>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("useServices needs a ServicesProvider above it");
  return services;
}

export function useSessionStatus(): SessionStatus {
  const { session } = useServices();
  return useSyncExternalStore(session.subscribe, session.getStatus);
}
