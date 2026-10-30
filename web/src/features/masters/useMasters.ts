import { useQuery } from "@tanstack/react-query";
import { unwrap } from "../../api/client.ts";
import type { Ok } from "../../api/types.ts";
import { useServices } from "../../app/ServicesContext.tsx";
import type { SelectOption } from "../../ui/SelectField.tsx";

export type Driver = Ok<"/drivers", "get">["items"][number];
export type Tractor = Ok<"/tractors", "get">["items"][number];
export type Khet = Ok<"/khets", "get">["items"][number];
export type Labourer = Ok<"/labourers", "get">["items"][number];

// The business has a handful of each (4 tractors, 4 drivers, a few khets), so each list is
// loaded whole, inactive ones included, and filtered on the screen.
const ALL = { active: "all", limit: 200 } as const;

export function useDrivers() {
  const { api } = useServices();
  return useQuery({
    queryKey: ["drivers"],
    queryFn: async () => unwrap(await api.GET("/drivers", { params: { query: ALL } })).items,
  });
}

export function useTractors() {
  const { api } = useServices();
  return useQuery({
    queryKey: ["tractors"],
    queryFn: async () => unwrap(await api.GET("/tractors", { params: { query: ALL } })).items,
  });
}

export function useKhets() {
  const { api } = useServices();
  return useQuery({
    queryKey: ["khets"],
    queryFn: async () => unwrap(await api.GET("/khets", { params: { query: ALL } })).items,
  });
}

export function useLabourers() {
  const { api } = useServices();
  return useQuery({
    queryKey: ["labourers"],
    queryFn: async () => unwrap(await api.GET("/labourers", { params: { query: ALL } })).items,
  });
}

interface Master {
  id: number;
  isActive: boolean;
}

/**
 * Options for a picker: active entries, plus the one an older entry already uses even if it
 * has since been deactivated, so editing that entry does not silently change it.
 */
export function pickerOptions<T extends Master>(
  items: T[] | undefined,
  currentId: string,
  label: (item: T) => string,
): SelectOption[] {
  return (items ?? [])
    .filter((item) => item.isActive || String(item.id) === currentId)
    .map((item) => ({ value: String(item.id), label: label(item) }));
}

/** Options for a list filter: every entry, with inactive ones marked. */
export function filterOptions<T extends Master>(
  items: T[] | undefined,
  label: (item: T) => string,
): SelectOption[] {
  return (items ?? []).map((item) => ({
    value: String(item.id),
    label: item.isActive ? label(item) : `${label(item)} (inactive)`,
  }));
}
