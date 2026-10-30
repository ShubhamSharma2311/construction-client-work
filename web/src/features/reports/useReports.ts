import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import type { Ok } from "../../api/types.ts";
import { useServices } from "../../app/ServicesContext.tsx";
import type { DateRange } from "../../lib/ranges.ts";
import type { PayMode } from "../../lib/payModes.ts";

export type ProfitReport = Ok<"/reports/pnl", "get">;
export type CashBook = Ok<"/reports/cashbook", "get">;
export type DaySummary = Ok<"/reports/summary", "get">;
export type TractorReport = Ok<"/reports/tractors", "get">;
export type KhetReport = Ok<"/reports/khets", "get">;
export type DriverReport = Ok<"/reports/drivers", "get">;

// Every report key starts with "reports", so any money saved anywhere refreshes them all.

export function useProfit(range: DateRange): UseQueryResult<ProfitReport> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["reports", "pnl", range],
    queryFn: async () => unwrap(await api.GET("/reports/pnl", { params: { query: range } })),
  });
}

export function useCashBook(range: DateRange, mode: PayMode): UseQueryResult<CashBook> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["reports", "cashbook", range, mode],
    queryFn: async () =>
      unwrap(await api.GET("/reports/cashbook", { params: { query: { ...range, mode } } })),
  });
}

export function useDaySummary(range: DateRange): UseQueryResult<DaySummary> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["reports", "summary", range],
    queryFn: async () => unwrap(await api.GET("/reports/summary", { params: { query: range } })),
  });
}

export function useTractorReport(range: DateRange): UseQueryResult<TractorReport> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["reports", "tractors", range],
    queryFn: async () => unwrap(await api.GET("/reports/tractors", { params: { query: range } })),
  });
}

export function useKhetReport(range: DateRange): UseQueryResult<KhetReport> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["reports", "khets", range],
    queryFn: async () => unwrap(await api.GET("/reports/khets", { params: { query: range } })),
  });
}

export function useDriverReport(range: DateRange): UseQueryResult<DriverReport> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["reports", "drivers", range],
    queryFn: async () => unwrap(await api.GET("/reports/drivers", { params: { query: range } })),
  });
}
