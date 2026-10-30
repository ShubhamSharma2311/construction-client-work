import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import type { BodyOf, ExpenseItem, Ok } from "../../api/types.ts";
import { useRefreshMoney } from "../../app/moneyQueries.ts";
import { useServices } from "../../app/ServicesContext.tsx";
import type { DateRange } from "../../lib/ranges.ts";
import { type ExpenseFilters, expenseQuery } from "./expenseFilters.ts";

export type NewExpense = BodyOf<"/expenses", "post">;
export type ExpenseChanges = BodyOf<"/expenses/{id}", "patch">;
export type DieselReport = Ok<"/reports/diesel", "get">;

export function useExpenseList(filters: ExpenseFilters) {
  const { api } = useServices();
  return useInfiniteQuery({
    queryKey: ["expenses", filters],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET("/expenses", {
          params: { query: { ...expenseQuery(filters), page: pageParam, limit: 50 } },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
}

export function useExpense(id: number): UseQueryResult<ExpenseItem> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["expenses", "one", id],
    queryFn: async () => unwrap(await api.GET("/expenses/{id}", { params: { path: { id } } })),
  });
}

/** Saves an expense once, however often it is retried with the same key. */
export function useCreateExpense() {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async ({ body, key }: { body: NewExpense; key: string }) =>
      unwrap(await api.POST("/expenses", { body, headers: { "Idempotency-Key": key } })),
    onSuccess: () => refreshMoney(),
  });
}

export function useUpdateExpense(id: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (body: ExpenseChanges) =>
      unwrap(await api.PATCH("/expenses/{id}", { params: { path: { id } }, body })),
    onSuccess: () => refreshMoney(),
  });
}

export function useDeleteExpense(id: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE("/expenses/{id}", { params: { path: { id } } })),
    onSuccess: () => refreshMoney(),
  });
}

export function useRestoreExpense(id: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async () =>
      unwrap(await api.POST("/expenses/{id}/restore", { params: { path: { id } } })),
    onSuccess: () => refreshMoney(),
  });
}

export function useDieselReport(range: DateRange | null): UseQueryResult<DieselReport> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["reports", "diesel", range],
    queryFn: async () =>
      unwrap(
        await api.GET("/reports/diesel", {
          params: { query: range ? { from: range.from, to: range.to } : {} },
        }),
      ),
  });
}
