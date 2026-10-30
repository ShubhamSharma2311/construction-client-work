import { useQuery } from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import { useServices } from "../../app/ServicesContext.tsx";

export const SETTINGS_KEY = ["settings"] as const;

/** Business settings, or null on a new install that has not saved them yet. */
export function useSettings() {
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
