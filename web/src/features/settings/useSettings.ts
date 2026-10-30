import {
  type UseMutationResult,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { expectNoContent, unwrap } from "../../api/client.ts";
import type { BodyOf, Ok } from "../../api/types.ts";
import { useRefreshMoney } from "../../app/moneyQueries.ts";
import { useServices } from "../../app/ServicesContext.tsx";

export const SETTINGS_KEY = ["settings"] as const;

export type Settings = Ok<"/settings", "get">;

/** Business settings, or null on a new install that has not saved them yet. */
export function useSettings(): UseQueryResult<Settings | null> {
  const { api } = useServices();
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const result = await api.GET("/settings");
      if (result.response.status === 404) return null;
      return unwrap(result);
    },
  });
}

type SettingsBody = BodyOf<"/settings", "put">;

/**
 * Saves the business settings, the first time or after. The opening cash and start date
 * feed every balance and report, so all money screens reload.
 */
export function useSaveSettings(): UseMutationResult<Settings, Error, SettingsBody> {
  const { api } = useServices();
  const queryClient = useQueryClient();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (body: SettingsBody) => unwrap(await api.PUT("/settings", { body })),
    onSuccess: async (saved) => {
      queryClient.setQueryData(SETTINGS_KEY, saved);
      await refreshMoney();
    },
  });
}

type PasswordBody = BodyOf<"/auth/change-password", "post">;

/** The API signs every device out when it succeeds, this one included. */
export function useChangePassword(): UseMutationResult<void, Error, PasswordBody> {
  const { api } = useServices();
  return useMutation({
    mutationFn: async (body: PasswordBody) => {
      expectNoContent(await api.POST("/auth/change-password", { body }));
    },
  });
}
