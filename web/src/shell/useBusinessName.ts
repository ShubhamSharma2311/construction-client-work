import { useSettings } from "../features/settings/useSettings.ts";
import { APP_NAME } from "../lib/appName.ts";

export interface BusinessName {
  name: string;
  /** The settings could not be loaded, so `name` is only the app's own name. */
  failed: boolean;
}

/** The business name from settings, or the app's own name until settings are saved. */
export function useBusinessName(): BusinessName {
  const { data, isError } = useSettings();
  return { name: data?.businessName ?? APP_NAME, failed: isError };
}
