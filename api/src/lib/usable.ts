import { AppError, notFound } from "./errors.ts";

interface Activatable {
  id: number;
  isActive: boolean;
}

/**
 * A master an entry points at must exist and be active. An edit may keep pointing at one
 * deactivated since; it may not switch to a deactivated one.
 */
export function assertUsable<Row extends Activatable>(
  entity: string,
  row: Row | null,
  id: number,
  previousId: number | null | undefined,
  label: (row: Row) => string,
): Row {
  if (!row) throw notFound(entity, id);
  if (!row.isActive && row.id !== previousId) {
    throw new AppError("CONFLICT", `${entity} ${label(row)} is inactive`);
  }
  return row;
}
