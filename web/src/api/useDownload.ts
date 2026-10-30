import { useMutation } from "@tanstack/react-query";
import { useServices } from "../app/ServicesContext.tsx";
import { toApiError } from "./errors.ts";

const FILE_NAME = /filename="([^"]+)"/;

/**
 * Downloads a CSV export. A plain link cannot carry the sign in token, so the file is
 * fetched with it and handed to the browser to save.
 */
export function useDownload() {
  const { session, baseUrl } = useServices();
  return useMutation({
    mutationFn: async ({ path, query }: { path: string; query?: Record<string, string> }) => {
      const url = new URL(`${baseUrl}${path}`);
      for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
      const response = await session.authFetch(new Request(url));
      if (!response.ok) throw toApiError(response, await response.json().catch(() => null));
      const name =
        FILE_NAME.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "export.csv";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await response.blob());
      link.download = name;
      link.click();
      URL.revokeObjectURL(link.href);
      return name;
    },
  });
}
