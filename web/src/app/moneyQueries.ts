import { type QueryClient, useQueryClient } from "@tanstack/react-query";

// Everything a money entry can change. Saving a trip, payment, expense and so on refreshes
// all of these, so no screen shows a total from before the save.
const MONEY_QUERIES = new Set([
  "dashboard",
  "trips",
  "trip",
  "dues",
  "customer-ledger",
  "payments",
  "expenses",
  "loans",
  "driver-ledger",
  "partner-ledger",
  "reports",
]);

export function refreshMoney(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) =>
      typeof query.queryKey[0] === "string" && MONEY_QUERIES.has(query.queryKey[0]),
  });
}

export function useRefreshMoney(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => refreshMoney(queryClient);
}
