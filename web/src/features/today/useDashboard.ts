import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import type { Dashboard } from "../../api/types.ts";
import { useServices } from "../../app/ServicesContext.tsx";
import type { IsoDate } from "../../lib/dates.ts";

/** Every saved entry can change the Today figures, so saves invalidate this whole key. */
export const DASHBOARD_KEY = ["dashboard"] as const;

export function useDashboard(date: IsoDate): UseQueryResult<Dashboard> {
  const { api } = useServices();
  return useQuery({
    queryKey: [...DASHBOARD_KEY, date],
    queryFn: async () => unwrap(await api.GET("/dashboard", { params: { query: { date } } })),
  });
}
