import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import type { BodyOf, Ok } from "../../api/types.ts";
import { useRefreshMoney } from "../../app/moneyQueries.ts";
import { useServices } from "../../app/ServicesContext.tsx";
import type { DateRange } from "../../lib/ranges.ts";

export type DriverDetail = Ok<"/drivers/{id}", "get">;
export type MonthSalary = Ok<"/drivers/{id}/salary", "get">;
export type DriverLedger = Ok<"/drivers/{id}/ledger", "get">;
export type DriverPayment = Ok<"/driver-payments", "get">["items"][number];

const DRIVERS_KEY = ["drivers"] as const;

export function useDriver(id: number): UseQueryResult<DriverDetail> {
  const { api } = useServices();
  return useQuery({
    queryKey: [...DRIVERS_KEY, "one", id],
    queryFn: async () => unwrap(await api.GET("/drivers/{id}", { params: { path: { id } } })),
  });
}

/** Drivers appear in every picker and list, so any change reloads them all. */
export function useCreateDriver() {
  const { api } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: BodyOf<"/drivers", "post">) =>
      unwrap(await api.POST("/drivers", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DRIVERS_KEY }),
  });
}

/**
 * A driver's usual tractor shows on the tractors, and joining or leaving dates change what a
 * month's salary works out to, so the account and its previews reload as well.
 */
export function useUpdateDriver(id: number) {
  const { api } = useServices();
  const queryClient = useQueryClient();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (body: BodyOf<"/drivers/{id}", "patch">) =>
      unwrap(await api.PATCH("/drivers/{id}", { params: { path: { id } }, body })),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: DRIVERS_KEY }),
        queryClient.invalidateQueries({ queryKey: ["tractors"] }),
        refreshMoney(),
      ]),
  });
}

/** A new rate changes what open months work out to, so the salary previews reload too. */
export function useAddSalaryRate(id: number) {
  const { api } = useServices();
  const queryClient = useQueryClient();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (body: BodyOf<"/drivers/{id}/salary-rates", "post">) =>
      unwrap(await api.POST("/drivers/{id}/salary-rates", { params: { path: { id } }, body })),
    onSuccess: () =>
      Promise.all([queryClient.invalidateQueries({ queryKey: DRIVERS_KEY }), refreshMoney()]),
  });
}

/** Removes a rate entered by mistake; the API refuses one a closed month already used. */
export function useRemoveSalaryRate(id: number) {
  const { api } = useServices();
  const queryClient = useQueryClient();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (rateId: number) =>
      unwrap(
        await api.DELETE("/drivers/{id}/salary-rates/{rateId}", {
          params: { path: { id, rateId } },
        }),
      ),
    onSuccess: () =>
      Promise.all([queryClient.invalidateQueries({ queryKey: DRIVERS_KEY }), refreshMoney()]),
  });
}

export function useMonthSalary(id: number, month: string): UseQueryResult<MonthSalary> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["driver-ledger", id, "salary", month],
    enabled: /^\d{4}-\d{2}$/.test(month),
    queryFn: async () =>
      unwrap(await api.GET("/drivers/{id}/salary", { params: { path: { id }, query: { month } } })),
  });
}

export function useCloseMonth(id: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (body: BodyOf<"/drivers/{id}/close-month", "post">) =>
      unwrap(await api.POST("/drivers/{id}/close-month", { params: { path: { id } }, body })),
    onSuccess: () => refreshMoney(),
  });
}

/** Reopens a closed month: its salary is taken back off the driver's account. */
export function useReopenMonth(id: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (month: string) =>
      unwrap(
        await api.DELETE("/drivers/{id}/close-month/{month}", { params: { path: { id, month } } }),
      ),
    onSuccess: () => refreshMoney(),
  });
}

export function useDriverLedger(id: number, range: DateRange | null): UseQueryResult<DriverLedger> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["driver-ledger", id, range],
    queryFn: async () =>
      unwrap(
        await api.GET("/drivers/{id}/ledger", {
          params: { path: { id }, query: range ? { from: range.from, to: range.to } : {} },
        }),
      ),
  });
}

export function useAddDriverOpening(id: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async ({
      body,
      key,
    }: {
      body: BodyOf<"/drivers/{id}/opening-balance", "post">;
      key: string;
    }) =>
      unwrap(
        await api.POST("/drivers/{id}/opening-balance", {
          params: { path: { id } },
          body,
          headers: { "Idempotency-Key": key },
        }),
      ),
    onSuccess: () => refreshMoney(),
  });
}

/**
 * Pays an advance or salary once, however often it is retried with the same key. The driver
 * comes with each call, since the payment screen may not have one chosen yet.
 */
export function usePayDriver() {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async ({
      driverId,
      body,
      key,
    }: {
      driverId: number;
      body: BodyOf<"/drivers/{id}/payments", "post">;
      key: string;
    }) =>
      unwrap(
        await api.POST("/drivers/{id}/payments", {
          params: { path: { id: driverId } },
          body,
          headers: { "Idempotency-Key": key },
        }),
      ),
    onSuccess: () => refreshMoney(),
  });
}

/** A bonus is earned and paid at once, so it needs a reason. The driver comes with each call. */
export function usePayBonus() {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async ({
      driverId,
      body,
      key,
    }: {
      driverId: number;
      body: BodyOf<"/drivers/{id}/bonus", "post">;
      key: string;
    }) =>
      unwrap(
        await api.POST("/drivers/{id}/bonus", {
          params: { path: { id: driverId } },
          body,
          headers: { "Idempotency-Key": key },
        }),
      ),
    onSuccess: () => refreshMoney(),
  });
}

export function useDriverPayments(driverId: number) {
  const { api } = useServices();
  return useInfiniteQuery({
    queryKey: ["driver-ledger", driverId, "payments"],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET("/driver-payments", {
          params: { query: { driverId, page: pageParam, limit: 20 } },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
}

export function useDeleteDriverPayment() {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (id: number) =>
      unwrap(await api.DELETE("/driver-payments/{id}", { params: { path: { id } } })),
    onSuccess: () => refreshMoney(),
  });
}

/** Removes an old register balance entered wrongly, so the right one can be entered. */
export function useRemoveDriverOpening(id: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE("/drivers/{id}/opening-balance", { params: { path: { id } } })),
    onSuccess: () => refreshMoney(),
  });
}
