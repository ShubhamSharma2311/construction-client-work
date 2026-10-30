import { useMutation, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import type { BodyOf, Ok } from "../../api/types.ts";
import { useRefreshMoney } from "../../app/moneyQueries.ts";
import { useServices } from "../../app/ServicesContext.tsx";
import type { TripItem } from "../trips/tripFilters.ts";

export type Payment = Ok<"/payments/{id}", "get">;
export type NewPayment = BodyOf<"/customers/{id}/payments", "post">;
export type PaymentChanges = BodyOf<"/payments/{id}", "patch">;

export function usePayment(id: number): UseQueryResult<Payment> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["payment", id],
    queryFn: async () => unwrap(await api.GET("/payments/{id}", { params: { path: { id } } })),
  });
}

/** Saves a payment or write-off once, however often it is retried with the same key. */
export function useRecordPayment() {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async ({
      customerId,
      body,
      key,
    }: {
      customerId: number;
      body: NewPayment;
      key: string;
    }) =>
      unwrap(
        await api.POST("/customers/{id}/payments", {
          params: { path: { id: customerId } },
          body,
          headers: { "Idempotency-Key": key },
        }),
      ),
    onSuccess: () => refreshMoney(),
  });
}

export function useUpdatePayment(id: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (body: PaymentChanges) =>
      unwrap(await api.PATCH("/payments/{id}", { params: { path: { id } }, body })),
    onSuccess: () => refreshMoney(),
  });
}

export function useDeletePayment(id: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE("/payments/{id}", { params: { path: { id } } })),
    onSuccess: () => refreshMoney(),
  });
}

/** The customer's trips that still have money due, oldest first, for choosing what a payment pays. */
export function useUnpaidTrips(customerId: number | null): UseQueryResult<TripItem[]> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["trips", "unpaid", customerId],
    enabled: customerId !== null,
    queryFn: async () => {
      // Asked by status, not read from all trips, so a long history cannot push old dues
      // past the page limit.
      const pages = await Promise.all(
        (["DUE", "PARTIAL"] as const).map(async (status) =>
          unwrap(
            await api.GET("/trips", {
              params: { query: { customerId: customerId ?? 0, status, limit: 200 } },
            }),
          ),
        ),
      );
      // The same order the server's "oldest first" uses: the old register balance, then by date.
      return pages
        .flatMap((page) => page.items)
        .sort(
          (a, b) =>
            Number(b.kind === "OPENING_BALANCE") - Number(a.kind === "OPENING_BALANCE") ||
            a.tripDate.localeCompare(b.tripDate) ||
            a.id - b.id,
        );
    },
  });
}
