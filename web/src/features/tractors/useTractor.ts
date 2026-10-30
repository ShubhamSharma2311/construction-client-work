import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import type { BodyOf, Ok } from "../../api/types.ts";
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

/** Tractors appear in every picker and list, so any change reloads them all. */
export function useCreateTractor() {
  const { api } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: BodyOf<"/tractors", "post">) =>
      unwrap(await api.POST("/tractors", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tractors"] }),
  });
}

export function useUpdateTractor(id: number) {
  const { api } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: BodyOf<"/tractors/{id}", "patch">) =>
      unwrap(await api.PATCH("/tractors/{id}", { params: { path: { id } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tractors"] }),
  });
}
