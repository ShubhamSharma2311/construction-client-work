import {
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { type Api, unwrap } from "../../api/client.ts";
import type { BodyOf, Ok } from "../../api/types.ts";
import { useRefreshMoney } from "../../app/moneyQueries.ts";
import { useServices } from "../../app/ServicesContext.tsx";
import type { DateRange } from "../../lib/ranges.ts";

export type Customer = Ok<"/customers", "get">["items"][number];
export type NewCustomer = BodyOf<"/customers", "post">;
export type CustomerChanges = BodyOf<"/customers/{id}", "patch">;
export type CustomerLedger = Ok<"/customers/{id}/ledger", "get">;

export const CUSTOMERS_KEY = ["customers"] as const;

/** Active customers whose name, village or phone matches; the first few when empty. */
export function customerSearch(api: Api, term: string) {
  return queryOptions({
    queryKey: [...CUSTOMERS_KEY, "search", term],
    queryFn: async () => {
      const query = { active: "true", limit: 8, ...(term ? { search: term } : {}) } as const;
      return unwrap(await api.GET("/customers", { params: { query } })).items;
    },
  });
}

export function useCustomerSearch(term: string) {
  const { api } = useServices();
  // Keep the last matches on screen while the next search loads, so the list does not flash.
  return useQuery({ ...customerSearch(api, term), placeholderData: keepPreviousData });
}

/** Every customer, searchable, 50 at a time; inactive ones only when asked for. */
export function useCustomerList(term: string, includeInactive: boolean) {
  const { api } = useServices();
  return useInfiniteQuery({
    queryKey: [...CUSTOMERS_KEY, "list", term, includeInactive],
    queryFn: async ({ pageParam }) => {
      const query = {
        active: includeInactive ? "all" : "true",
        page: pageParam,
        limit: 50,
        ...(term ? { search: term } : {}),
      } as const;
      return unwrap(await api.GET("/customers", { params: { query } }));
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(id: number): UseQueryResult<Customer> {
  const { api } = useServices();
  return useQuery({
    queryKey: [...CUSTOMERS_KEY, "one", id],
    queryFn: async () => unwrap(await api.GET("/customers/{id}", { params: { path: { id } } })),
  });
}

export function useCreateCustomer() {
  const { api } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: NewCustomer) => unwrap(await api.POST("/customers", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CUSTOMERS_KEY }),
  });
}

export function useUpdateCustomer(id: number) {
  const { api } = useServices();
  const queryClient = useQueryClient();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (body: CustomerChanges) =>
      unwrap(await api.PATCH("/customers/{id}", { params: { path: { id } }, body })),
    // Names appear on dues, trips and ledgers too, so those reload as well.
    onSuccess: () =>
      Promise.all([queryClient.invalidateQueries({ queryKey: CUSTOMERS_KEY }), refreshMoney()]),
  });
}

export function useCustomerLedger(
  id: number,
  range: DateRange | null,
): UseQueryResult<CustomerLedger> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["customer-ledger", id, range],
    queryFn: async () =>
      unwrap(
        await api.GET("/customers/{id}/ledger", {
          params: { path: { id }, query: range ? { from: range.from, to: range.to } : {} },
        }),
      ),
  });
}

export function useAddOpeningBalance(id: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async ({
      body,
      key,
    }: {
      body: BodyOf<"/customers/{id}/opening-balance", "post">;
      key: string;
    }) =>
      unwrap(
        await api.POST("/customers/{id}/opening-balance", {
          params: { path: { id } },
          body,
          headers: { "Idempotency-Key": key },
        }),
      ),
    onSuccess: () => refreshMoney(),
  });
}

export function useApplyCredit(id: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (key: string) =>
      unwrap(
        await api.POST("/customers/{id}/apply-credit", {
          params: { path: { id } },
          headers: { "Idempotency-Key": key },
        }),
      ),
    onSuccess: () => refreshMoney(),
  });
}

export type CustomerBalance = Ok<"/customers/{id}/balance", "get">;

/** What one customer owes or holds as credit; the dues list leaves out those in credit. */
export function useCustomerBalance(id: number): UseQueryResult<CustomerBalance> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["customer-balance", id],
    queryFn: async () =>
      unwrap(await api.GET("/customers/{id}/balance", { params: { path: { id } } })),
  });
}
