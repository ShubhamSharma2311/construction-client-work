import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import type { BodyOf, Ok } from "../../api/types.ts";
import { useRefreshMoney } from "../../app/moneyQueries.ts";
import { useServices } from "../../app/ServicesContext.tsx";

export type TractorDetail = Ok<"/tractors/{id}", "get">;
export type ServiceHistory = Ok<"/tractors/{id}/services", "get">;

export function useTractor(id: number): UseQueryResult<TractorDetail> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["tractors", "one", id],
    queryFn: async () => unwrap(await api.GET("/tractors/{id}", { params: { path: { id } } })),
  });
}

export function useServiceHistory(id: number): UseQueryResult<ServiceHistory> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["expenses", "services", id],
    queryFn: async () =>
      unwrap(await api.GET("/tractors/{id}/services", { params: { path: { id } } })),
  });
}

/** Tractors appear in every picker, so a new one reloads those lists. */
export function useCreateTractor() {
  const { api } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: BodyOf<"/tractors", "post">) =>
      unwrap(await api.POST("/tractors", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tractors"] }),
  });
}

/** A tractor's number also shows on its loans, EMIs, trips and expenses; all of them reload. */
export function useUpdateTractor(id: number) {
  const { api } = useServices();
  const queryClient = useQueryClient();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (body: BodyOf<"/tractors/{id}", "patch">) =>
      unwrap(await api.PATCH("/tractors/{id}", { params: { path: { id } }, body })),
    onSuccess: () =>
      Promise.all([queryClient.invalidateQueries({ queryKey: ["tractors"] }), refreshMoney()]),
  });
}
