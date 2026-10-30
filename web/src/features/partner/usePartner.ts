import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import type { BodyOf, Ok } from "../../api/types.ts";
import { useRefreshMoney } from "../../app/moneyQueries.ts";
import { useServices } from "../../app/ServicesContext.tsx";
import type { DateRange } from "../../lib/ranges.ts";

export type Partner = Ok<"/partners", "get">["items"][number];
export type PartnerLedger = Ok<"/partners/{id}/ledger", "get">;
export type PartnerShare = Ok<"/partners/{id}/share", "get">;
export type PartnerEntry = PartnerLedger["entries"][number];

const PARTNERS_KEY = ["partners"] as const;

export function usePartners(): UseQueryResult<Partner[]> {
  const { api } = useServices();
  return useQuery({
    queryKey: PARTNERS_KEY,
    queryFn: async () =>
      unwrap(await api.GET("/partners", { params: { query: { active: "all", limit: 200 } } }))
        .items,
  });
}

export function useCreatePartner() {
  const { api } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: BodyOf<"/partners", "post">) =>
      unwrap(await api.POST("/partners", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PARTNERS_KEY }),
  });
}

/** A new share changes what the partner is owed, so the share figures reload too. */
export function useUpdatePartner(id: number) {
  const { api } = useServices();
  const queryClient = useQueryClient();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (body: BodyOf<"/partners/{id}", "patch">) =>
      unwrap(await api.PATCH("/partners/{id}", { params: { path: { id } }, body })),
    onSuccess: () =>
      Promise.all([queryClient.invalidateQueries({ queryKey: PARTNERS_KEY }), refreshMoney()]),
  });
}

export function usePartnerLedger(
  id: number,
  range: DateRange | null,
): UseQueryResult<PartnerLedger> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["partner-ledger", id, range],
    queryFn: async () =>
      unwrap(
        await api.GET("/partners/{id}/ledger", {
          params: { path: { id }, query: range ? { from: range.from, to: range.to } : {} },
        }),
      ),
  });
}

/** The partner's share of the profit over the dates; the API refuses until a share is set. */
export function usePartnerShare(
  id: number,
  range: DateRange,
  enabled: boolean,
): UseQueryResult<PartnerShare> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["partner-ledger", id, "share", range],
    enabled,
    queryFn: async () =>
      unwrap(
        await api.GET("/partners/{id}/share", {
          params: { path: { id }, query: { from: range.from, to: range.to } },
        }),
      ),
  });
}

/** Records money paid to or received from the partner once, however often it is retried. */
export function useRecordPartnerTxn(id: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async ({
      body,
      key,
    }: {
      body: BodyOf<"/partners/{id}/txns", "post">;
      key: string;
    }) =>
      unwrap(
        await api.POST("/partners/{id}/txns", {
          params: { path: { id } },
          body,
          headers: { "Idempotency-Key": key },
        }),
      ),
    onSuccess: () => refreshMoney(),
  });
}

export function useDeletePartnerTxn() {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (txnId: number) =>
      unwrap(await api.DELETE("/partner-txns/{id}", { params: { path: { id: txnId } } })),
    onSuccess: () => refreshMoney(),
  });
}
