import { useInfiniteQuery } from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import type { Ok } from "../../api/types.ts";
import { useServices } from "../../app/ServicesContext.tsx";

export type AuditEntry = Ok<"/audit", "get">["items"][number];
export type AuditAction = AuditEntry["action"];

/** Every change to one kind of entry, newest first, a page at a time. */
export function useHistory(entity: string) {
  const { api } = useServices();
  return useInfiniteQuery({
    queryKey: ["audit", entity],
    // Any save anywhere adds history, so it is asked afresh each time it is opened.
    staleTime: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET("/audit", { params: { query: { entity, page: pageParam, limit: 30 } } }),
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
}
