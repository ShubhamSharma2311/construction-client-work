import { z } from "zod";
import { Prisma } from "../generated/prisma/client.ts";
import { AppError } from "./errors.ts";

// Shape of `meta` when the pg driver adapter reports a database error.
const adapterMeta = z.object({
  driverAdapterError: z
    .object({
      cause: z
        .object({
          originalCode: z.string().optional(),
          originalMessage: z.string().optional(),
          constraint: z.object({ index: z.string() }).optional(),
        })
        .optional(),
    })
    .optional(),
});

const CHECK_VIOLATION = "23514";

/**
 * Turns a database constraint failure into an API error. The services check these rules
 * first with clearer messages; this is the backstop for races and missed checks.
 * Returns null for anything that is not a constraint failure.
 */
export function fromPrismaError(error: unknown): AppError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const cause = adapterMeta.safeParse(error.meta).data?.driverAdapterError?.cause;
  const constraint =
    cause?.constraint?.index ?? /constraint "([^"]+)"/.exec(cause?.originalMessage ?? "")?.[1];
  const details = constraint ? { constraint } : undefined;

  switch (error.code) {
    case "P2002":
      return new AppError("CONFLICT", "This would duplicate an existing record", details);
    case "P2003":
      return new AppError(
        "CONFLICT",
        "This refers to a record that does not exist or is still in use",
        details,
      );
    case "P2025":
      return new AppError("NOT_FOUND", "Record not found");
    case "P2020":
      return new AppError("VALIDATION", "A value is out of range for its column");
  }
  if (cause?.originalCode === CHECK_VIOLATION) {
    return new AppError("CONFLICT", "This breaks a data rule", details);
  }
  return null;
}
