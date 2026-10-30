import { useQuery } from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import { useServices } from "../../app/ServicesContext.tsx";
import type { IsoDate } from "../../lib/dates.ts";

export function useDashboard(date: IsoDate) {
  const { api } = useServices();
  return useQuery({
    queryKey: ["dashboard", date],
    queryFn: async () => unwrap(await api.GET("/dashboard", { params: { query: { date } } })),
  });
}
