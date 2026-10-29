import { useQuery } from "@tanstack/react-query";
import { unwrap } from "../api/client.ts";
import { useServices } from "../app/ServicesContext.tsx";
import { APP_NAME } from "../lib/appName.ts";

export interface BusinessName {
  name: string;
  /** The settings could not be loaded, so `name` is only the app's own name. */
  failed: boolean;
}

/** The business name from settings, or the app's own name until settings are saved. */
export function useBusinessName(): BusinessName {
  const { api } = useServices();
  const { data, isError } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const result = await api.GET("/settings");
      // A new install has no settings yet; that is a normal state, not a failure.
      if (result.response.status === 404) return null;
      return unwrap(result);
    },
  });
  return { name: data?.businessName ?? APP_NAME, failed: isError };
}
