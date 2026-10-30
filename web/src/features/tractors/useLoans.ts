import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { expectNoContent, unwrap } from "../../api/client.ts";
import type { BodyOf, Ok } from "../../api/types.ts";
import { useRefreshMoney } from "../../app/moneyQueries.ts";
import { useServices } from "../../app/ServicesContext.tsx";

export type Loan = Ok<"/loans/{id}", "get">;
export type LoanSummary = Ok<"/loans", "get">[number];
export type ScheduleLine = Loan["schedule"][number];
export type EmiStatus = ScheduleLine["status"];
export type DueEmi = Ok<"/emi/due", "get">["items"][number];
export type NewLoan = BodyOf<"/tractors/{id}/loans", "post">;
export type EmiPayment = BodyOf<"/loans/{id}/emi", "post">;
export type Foreclosure = BodyOf<"/loans/{id}/foreclose", "post">;

export interface LoanQuery {
  tractorId?: number;
  /** The API lists open loans unless asked; a tractor's page wants closed ones too. */
  status: "open" | "closed" | "all";
}

export function useLoans(query: LoanQuery): UseQueryResult<LoanSummary[]> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["loans", "list", query],
    queryFn: async () => unwrap(await api.GET("/loans", { params: { query } })),
  });
}

export function useLoan(id: number): UseQueryResult<Loan> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["loans", "one", id],
    queryFn: async () => unwrap(await api.GET("/loans/{id}", { params: { path: { id } } })),
  });
}

/** EMIs overdue, due today, or due within the next `days` days, across every tractor. */
export function useEmiDue(days: number): UseQueryResult<Ok<"/emi/due", "get">> {
  const { api } = useServices();
  return useQuery({
    queryKey: ["loans", "due", days],
    queryFn: async () => unwrap(await api.GET("/emi/due", { params: { query: { days } } })),
  });
}

/** A loan can start in the past, so its EMIs may already be overdue on Today. */
export function useCreateLoan(tractorId: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (body: NewLoan) =>
      unwrap(await api.POST("/tractors/{id}/loans", { params: { path: { id: tractorId } }, body })),
    onSuccess: () => refreshMoney(),
  });
}

/** Pays one month's EMI once, however often it is retried with the same key. */
export function usePayEmi(loanId: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async ({ body, key }: { body: EmiPayment; key: string }) =>
      unwrap(
        await api.POST("/loans/{id}/emi", {
          params: { path: { id: loanId } },
          body,
          headers: { "Idempotency-Key": key },
        }),
      ),
    onSuccess: () => refreshMoney(),
  });
}

export function useForeclose(loanId: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async ({ body, key }: { body: Foreclosure; key: string }) =>
      unwrap(
        await api.POST("/loans/{id}/foreclose", {
          params: { path: { id: loanId } },
          body,
          headers: { "Idempotency-Key": key },
        }),
      ),
    onSuccess: () => refreshMoney(),
  });
}

/** Undoes one EMI payment, so that month is due again. */
export function useUndoEmi(loanId: number) {
  const { api } = useServices();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async (expenseId: number) =>
      unwrap(
        await api.DELETE("/loans/{id}/payments/{expenseId}", {
          params: { path: { id: loanId, expenseId } },
        }),
      ),
    onSuccess: () => refreshMoney(),
  });
}

/** Removes a loan entered by mistake; the API refuses once it has any payment history. */
export function useDeleteLoan(loanId: number) {
  const { api } = useServices();
  const queryClient = useQueryClient();
  const refreshMoney = useRefreshMoney();
  return useMutation({
    mutationFn: async () => {
      expectNoContent(await api.DELETE("/loans/{id}", { params: { path: { id: loanId } } }));
    },
    onSuccess: async () => {
      // The loan is gone: drop its page first, so a refresh does not ask for it and get a 404.
      queryClient.removeQueries({ queryKey: ["loans", "one", loanId] });
      await refreshMoney();
    },
  });
}
