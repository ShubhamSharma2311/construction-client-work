import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import { useServices } from "../../app/ServicesContext.tsx";
import type { TripItem } from "../trips/tripFilters.ts";

/** The customer's old register balance, if one was entered; there can be only one. */
export function useOpeningBalance(customerId: number): UseQueryResult<TripItem | null> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["trips", "opening", customerId],
    queryFn: async () => {
      const query = { customerId, kind: "OPENING_BALANCE", limit: 1 } as const;
      return unwrap(await api.GET("/trips", { params: { query } })).items[0] ?? null;
    },
  });
}
