import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import type { BodyOf, Ok } from "../../api/types.ts";
import { useRefreshMoney } from "../../app/moneyQueries.ts";
import { useServices } from "../../app/ServicesContext.tsx";
import { type TripFilters, type TripItem, tripQuery } from "./tripFilters.ts";

export type NewTrip = BodyOf<"/trips", "post">;
export type TripChanges = BodyOf<"/trips/{id}", "patch">;
export type SavedTrip = Ok<"/trips", "post">;

const PAGE_SIZE = 50;

export function useTripList(filters: TripFilters) {
  const { api } = useServices();
  return useInfiniteQuery({
    queryKey: ["trips", filters],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET("/trips", {
          params: { query: { ...tripQuery(filters), page: pageParam, limit: PAGE_SIZE } },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
}

export function useTrip(id: number): UseQueryResult<TripItem> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["trip", id],
    queryFn: async () => unwrap(await api.GET("/trips/{id}", { params: { path: { id } } })),
  });
}

/** Saves a new trip once, however often it is retried with the same key. */
export function useCreateTrip() {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async ({ body, key }: { body: NewTrip; key: string }) =>
      unwrap(await api.POST("/trips", { body, headers: { "Idempotency-Key": key } })),
    onSuccess: () => refreshMoney(),
  });
}

export function useUpdateTrip(id: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (body: TripChanges) =>
      unwrap(await api.PATCH("/trips/{id}", { params: { path: { id } }, body })),
    onSuccess: () => refreshMoney(),
  });
}

export function useDeleteTrip(id: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (releasePayments: boolean) =>
      unwrap(
        await api.DELETE("/trips/{id}", {
          params: { path: { id }, query: releasePayments ? { releasePayments: "true" } : {} },
        }),
      ),
    onSuccess: () => refreshMoney(),
  });
}

export function useRestoreTrip(id: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async () =>
      unwrap(await api.POST("/trips/{id}/restore", { params: { path: { id } } })),
    onSuccess: () => refreshMoney(),
  });
}
