import { z } from "zod";
import { paginationSchema, toSkipTake, type Pagination } from "./pagination.ts";

/** Pickers show active records; the owner can ask for inactive ones or everything. */
export const activeFilterSchema = z.enum(["true", "false", "all"]).default("true");
export type ActiveFilter = z.infer<typeof activeFilterSchema>;

export function activeWhere(filter: ActiveFilter): { isActive?: boolean } {
  return filter === "all" ? {} : { isActive: filter === "true" };
}

export const masterListQuery = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  active: activeFilterSchema,
});
export type MasterListQuery = z.infer<typeof masterListQuery>;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function pageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    items: z.array(item),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
  });
}

/** Runs one page query and its count together and maps rows to the response shape. */
export async function paged<Row, Item>(
  pagination: Pagination,
  query: {
    rows: (window: { skip: number; take: number }) => Promise<Row[]>;
    count: () => Promise<number>;
  },
  toItem: (row: Row) => Item,
): Promise<Page<Item>> {
  const [rows, total] = await Promise.all([query.rows(toSkipTake(pagination)), query.count()]);
  return { items: rows.map(toItem), total, page: pagination.page, limit: pagination.limit };
}
