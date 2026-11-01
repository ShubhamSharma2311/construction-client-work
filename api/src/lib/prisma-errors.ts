import { z } from "zod";
import { Prisma } from "#prisma/client.ts";
import { AppError } from "./errors.ts";

// Shape of `meta` when the SQLite driver adapter reports a database error.
const adapterMeta = z.object({
  driverAdapterError: z
    .object({
      cause: z
        .object({ originalCode: z.string().optional(), originalMessage: z.string().optional() })
        .optional(),
    })
    .optional(),
});

// SQLite names the broken rule only in its message: "CHECK constraint failed: <name>",
// "UNIQUE constraint failed: <Table.column>", or a trigger's own "<name>: <reason>".
const RULE_NAME = [
  /^CHECK constraint failed: (\w+)/,
  /^UNIQUE constraint failed: ([\w.]+)/,
  /^(\w+): /,
];
const RULE_BROKEN = new Set(["SQLITE_CONSTRAINT_CHECK", "SQLITE_CONSTRAINT_TRIGGER"]);

function ruleName(message: string | undefined): string | undefined {
  if (message === undefined) return undefined;
  for (const pattern of RULE_NAME) {
    const name = pattern.exec(message)?.[1];
    if (name) return name;
  }
  return undefined;
}

/**
 * Turns a database constraint failure into an API error. The services check these rules
 * first with clearer messages; this is the backstop for races and missed checks.
 * Returns null for anything that is not a constraint failure.
 */
export function fromPrismaError(error: unknown): AppError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const cause = adapterMeta.safeParse(error.meta).data?.driverAdapterError?.cause;
  const constraint = ruleName(cause?.originalMessage);
  const details = constraint ? { constraint } : undefined;

  // Before the code switch: Prisma labels a trigger's refusal as a foreign key failure.
  if (cause?.originalCode !== undefined && RULE_BROKEN.has(cause.originalCode)) {
    return new AppError("CONFLICT", "This breaks a data rule", details);
  }
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
  return null;
}
