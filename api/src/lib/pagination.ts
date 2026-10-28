import { z } from "zod";

export const MAX_PAGE_SIZE = 200;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function toSkipTake({ page, limit }: Pagination): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}
