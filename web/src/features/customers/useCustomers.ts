import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import type { BodyOf, Ok } from "../../api/types.ts";
import { useServices } from "../../app/ServicesContext.tsx";

export type Customer = Ok<"/customers", "get">["items"][number];
export type NewCustomer = BodyOf<"/customers", "post">;

export const CUSTOMERS_KEY = ["customers"] as const;

/** Active customers whose name, village or phone matches; the first few when empty. */
export function useCustomerSearch(term: string) {
  const { api } = useServices();
  return useQuery({
    queryKey: [...CUSTOMERS_KEY, "search", term],
    queryFn: async () => {
      const query = { active: "true", limit: 8, ...(term ? { search: term } : {}) } as const;
      return unwrap(await api.GET("/customers", { params: { query } })).items;
    },
    // Keep the last matches on screen while the next search loads, so the list does not flash.
    placeholderData: keepPreviousData,
  });
}

export function useCreateCustomer() {
  const { api } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: NewCustomer) => unwrap(await api.POST("/customers", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CUSTOMERS_KEY }),
  });
}
