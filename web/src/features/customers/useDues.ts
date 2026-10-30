import { useQuery } from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import type { Ok } from "../../api/types.ts";
import { useServices } from "../../app/ServicesContext.tsx";

export type DuesRow = Ok<"/dues", "get">["customers"][number];

export const DUES_KEY = ["dues"] as const;

/** Every customer who owes money or holds credit, oldest dues first. */
export function useDues() {
  const { api } = useServices();
  return useQuery({ queryKey: DUES_KEY, queryFn: async () => unwrap(await api.GET("/dues")) });
}
