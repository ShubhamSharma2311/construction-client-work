import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import type { BodyOf } from "../../api/types.ts";
import { useRefreshMoney } from "../../app/moneyQueries.ts";
import { useServices } from "../../app/ServicesContext.tsx";
import { type Khet, KHETS_KEY, type Labourer, LABOURERS_KEY } from "../masters/useMasters.ts";

type KhetBody = BodyOf<"/khets", "post">;
type KhetChanges = BodyOf<"/khets/{id}", "patch">;
type LabourerBody = BodyOf<"/labourers", "post">;
type LabourerChanges = BodyOf<"/labourers/{id}", "patch">;

/**
 * Khet and labourer names show on trips, expenses and reports, so an edit reloads those too;
 * a new one only needs its own list, for the pickers.
 */
function useReloadAfter(key: readonly string[], alsoRefreshMoney: boolean) {
  const queryClient = useQueryClient();
  const refreshMoney = useRefreshMoney();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      alsoRefreshMoney ? refreshMoney() : Promise.resolve(),
    ]);
}

export function useCreateKhet(): UseMutationResult<Khet, Error, KhetBody> {
  const { api } = useServices();
  const reload = useReloadAfter(KHETS_KEY, false);
  return useMutation({
    mutationFn: async (body: KhetBody) => unwrap(await api.POST("/khets", { body })),
    onSuccess: reload,
  });
}

export function useUpdateKhet(id: number): UseMutationResult<Khet, Error, KhetChanges> {
  const { api } = useServices();
  const reload = useReloadAfter(KHETS_KEY, true);
  return useMutation({
    mutationFn: async (body: KhetChanges) =>
      unwrap(await api.PATCH("/khets/{id}", { params: { path: { id } }, body })),
    onSuccess: reload,
  });
}

export function useCreateLabourer(): UseMutationResult<Labourer, Error, LabourerBody> {
  const { api } = useServices();
  const reload = useReloadAfter(LABOURERS_KEY, false);
  return useMutation({
    mutationFn: async (body: LabourerBody) => unwrap(await api.POST("/labourers", { body })),
    onSuccess: reload,
  });
}

export function useUpdateLabourer(id: number): UseMutationResult<Labourer, Error, LabourerChanges> {
  const { api } = useServices();
  const reload = useReloadAfter(LABOURERS_KEY, true);
  return useMutation({
    mutationFn: async (body: LabourerChanges) =>
      unwrap(await api.PATCH("/labourers/{id}", { params: { path: { id } }, body })),
    onSuccess: reload,
  });
}
