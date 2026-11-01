import {
  type ArgType,
  type ColumnType,
  ColumnTypeEnum,
  DriverAdapterError,
  type IsolationLevel,
  type SqlDriverAdapter,
  type SqlDriverAdapterFactory,
  type SqlQuery,
  type SqlResultSet,
  type Transaction,
} from "@prisma/driver-adapter-utils";

/** What a SQL query hands back: the shape of a Durable Object's SqlStorageCursor. */
export interface SqlCursor {
  readonly columnNames: string[];
  raw(): Iterable<unknown[]>;
}

/**
 * The parts of a Durable Object's storage (`ctx.storage`) the ledger uses. On Cloudflare it
 * is the object's own SQLite database; on this machine node-storage.ts stands in for it.
 */
export interface LedgerStorage {
  sql: { exec(query: string, ...bindings: unknown[]): SqlCursor };
  /** Every query run while the closure is pending commits with it, or rolls back if it throws. */
  transaction<T>(closure: () => Promise<T>): Promise<T>;
}

const NAME = "ledger-storage";

/**
 * Prisma's driver for the ledger's SQLite storage. Column types are inferred from the values,
 * as Prisma's D1 adapter does, because the storage does not report declared types.
 * Transactions are real (unlike D1's adapter, which ignores them); they rely on the API
 * serving one request at a time (one-at-a-time.ts), so no other query can join one.
 */
export class LedgerStorageAdapterFactory implements SqlDriverAdapterFactory {
  readonly provider = "sqlite";
  readonly adapterName = NAME;

  constructor(private readonly storage: LedgerStorage) {}

  connect(): Promise<SqlDriverAdapter> {
    return Promise.resolve(new LedgerStorageAdapter(this.storage));
  }
}

class LedgerStorageQueryable {
  readonly provider = "sqlite";
  readonly adapterName = NAME;

  constructor(protected readonly storage: LedgerStorage) {}

  queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    return Promise.resolve(
      guarded(() => {
        const cursor = this.storage.sql.exec(query.sql, ...bindings(query));
        const rows = Array.from(cursor.raw());
        if (rows.length === 0) return { columnNames: [], columnTypes: [], rows: [] };
        const columnTypes = columnTypesOf(cursor.columnNames.length, rows);
        return {
          columnNames: cursor.columnNames,
          columnTypes,
          rows: rows.map((row) => mapRow(row, columnTypes)),
        };
      }),
    );
  }

  executeRaw(query: SqlQuery): Promise<number> {
    return Promise.resolve(
      guarded(() => {
        Array.from(this.storage.sql.exec(query.sql, ...bindings(query)).raw());
        // The storage's own write counter also counts index rows; changes() is exact.
        const [row] = Array.from(this.storage.sql.exec("SELECT changes()").raw());
        return Number(row?.[0] ?? 0);
      }),
    );
  }
}

class LedgerStorageAdapter extends LedgerStorageQueryable implements SqlDriverAdapter {
  executeScript(script: string): Promise<void> {
    guarded(() => Array.from(this.storage.sql.exec(script).raw()));
    return Promise.resolve();
  }

  /** The last transaction opened; the next waits for it, as SQLite allows only one at a time. */
  private previous: Promise<unknown> = Promise.resolve();

  /** Opens a storage transaction and keeps it open until Prisma commits or rolls back. */
  async startTransaction(isolationLevel?: IsolationLevel): Promise<Transaction> {
    // SQLite transactions are always serializable.
    if (isolationLevel && isolationLevel !== "SERIALIZABLE") {
      throw new DriverAdapterError({ kind: "InvalidIsolationLevel", level: isolationLevel });
    }
    const turn = this.previous;
    let finish!: (commit: boolean) => void;
    const decided = new Promise<boolean>((resolve) => {
      finish = resolve;
    });
    const opened = new Promise<Transaction>((handOver, refuse) => {
      const settled: Promise<void> = turn.then(() =>
        this.storage.transaction(async () => {
          handOver(new LedgerStorageTransaction(this.storage, finish, () => settled));
          if (!(await decided)) throw new RolledBack();
        }),
      );
      // A storage that fails before opening never calls the closure: say so instead of waiting.
      settled.catch(refuse);
      this.previous = settled.catch(() => undefined);
    });
    return opened;
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

/** Thrown inside the storage transaction to make it roll back. */
class RolledBack extends Error {}

class LedgerStorageTransaction extends LedgerStorageQueryable implements Transaction {
  // Prisma must not send its own COMMIT or ROLLBACK: the storage transaction does both.
  readonly options = { usePhantomQuery: true };

  constructor(
    storage: LedgerStorage,
    private readonly finish: (commit: boolean) => void,
    private readonly settled: () => Promise<void>,
  ) {
    super(storage);
  }

  async commit(): Promise<void> {
    this.finish(true);
    await this.settled();
  }

  async rollback(): Promise<void> {
    this.finish(false);
    try {
      await this.settled();
    } catch (error) {
      if (!(error instanceof RolledBack)) throw error;
    }
  }
}

function bindings(query: SqlQuery): unknown[] {
  return query.args.map((arg, index) => mapArg(arg, query.argTypes[index]));
}

/** Runs a storage call, turning a SQLite failure into the error shape Prisma expects. */
function guarded<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof Error) throw new DriverAdapterError(driverError(error));
    throw error;
  }
}

// SQLite names the broken rule in its message; the storage may wrap it ("Error: ...: SQLITE_CONSTRAINT").
const SQLITE_ERROR_CODE = /\bSQLITE_[A-Z_]+\b/;

/** The driver error for Prisma, keeping SQLite's code and message for prisma-errors.ts. */
function driverError(error: Error): ConstructorParameters<typeof DriverAdapterError>[0] {
  const message = error.message.replace(/^(\w+Error: )+/, "").replace(/: SQLITE_[A-Z_]+$/, "");
  const reportedCode = (error as { code?: unknown }).code;
  const originalCode =
    typeof reportedCode === "string" ? reportedCode : constraintCode(message, error.message);
  const original = { originalCode, originalMessage: message };
  if (message.startsWith("UNIQUE constraint failed") || message.startsWith("PRIMARY KEY")) {
    const fields = message
      .split(": ")[1]
      ?.split(", ")
      .map((field) => field.split(".").pop() ?? field);
    return {
      ...original,
      kind: "UniqueConstraintViolation",
      constraint: fields ? { fields } : undefined,
    };
  }
  if (message.startsWith("NOT NULL constraint failed")) {
    const fields = message
      .split(": ")[1]
      ?.split(", ")
      .map((field) => field.split(".").pop() ?? field);
    return {
      ...original,
      kind: "NullConstraintViolation",
      constraint: fields ? { fields } : undefined,
    };
  }
  if (message.startsWith("FOREIGN KEY constraint failed")) {
    return { ...original, kind: "ForeignKeyConstraintViolation", constraint: { foreignKey: {} } };
  }
  return { ...original, kind: "sqlite", extendedCode: 1, message };
}

/** SQLite's code for a broken rule, when the storage reports only the message. */
function constraintCode(message: string, raw: string): string | undefined {
  if (message.startsWith("CHECK constraint failed")) return "SQLITE_CONSTRAINT_CHECK";
  if (message.startsWith("UNIQUE constraint failed")) return "SQLITE_CONSTRAINT_UNIQUE";
  if (message.startsWith("NOT NULL constraint failed")) return "SQLITE_CONSTRAINT_NOTNULL";
  if (message.startsWith("FOREIGN KEY constraint failed")) return "SQLITE_CONSTRAINT_FOREIGNKEY";
  // A trigger's RAISE(ABORT, ...) carries only the trigger's own text.
  if (SQLITE_ERROR_CODE.exec(raw)?.[0] === "SQLITE_CONSTRAINT") return "SQLITE_CONSTRAINT_TRIGGER";
  return SQLITE_ERROR_CODE.exec(raw)?.[0];
}

// Dates are stored as ISO text; recognising them lets Prisma read them back as dates.
const ISO_DATE =
  /^\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d(:[0-5]\d(\.\d+)?)?([+-][0-2]\d:[0-5]\d|Z)$|^\d{4}-[01]\d-[0-3]\d [0-2]\d:[0-5]\d:[0-5]\d$/;

function columnTypesOf(columnCount: number, rows: unknown[][]): ColumnType[] {
  const types: ColumnType[] = [];
  for (let column = 0; column < columnCount; column++) {
    let type: ColumnType | undefined;
    for (const row of rows) {
      const value = row[column];
      if (value === null || value === undefined) continue;
      const inferred = typeOf(value);
      if (type === undefined || inferred === ColumnTypeEnum.Text) type = inferred;
      if (inferred !== ColumnTypeEnum.UnknownNumber) break;
    }
    types.push(type ?? ColumnTypeEnum.Int32);
  }
  return types;
}

function typeOf(value: unknown): ColumnType {
  if (typeof value === "string")
    return ISO_DATE.test(value) ? ColumnTypeEnum.DateTime : ColumnTypeEnum.Text;
  if (typeof value === "number" || typeof value === "bigint") return ColumnTypeEnum.UnknownNumber;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return ColumnTypeEnum.Bytes;
  throw new Error(`Unexpected value from SQLite storage: ${String(value)}`);
}

function mapRow(row: unknown[], types: ColumnType[]): unknown[] {
  return row.map((value, index) => {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "number" && types[index] === ColumnTypeEnum.Text) return String(value);
    return value;
  });
}

function mapArg(arg: unknown, type: ArgType | undefined): unknown {
  if (arg === null || arg === undefined) return null;
  if (typeof arg === "bigint" || (typeof arg === "string" && type?.scalarType === "bigint")) {
    const value = Number(arg);
    if (!Number.isSafeInteger(value)) throw new Error(`Integer out of range: ${arg}`);
    return value;
  }
  if (typeof arg === "string" && type?.scalarType === "int") return Number.parseInt(arg, 10);
  if (typeof arg === "string" && (type?.scalarType === "float" || type?.scalarType === "decimal")) {
    return Number.parseFloat(arg);
  }
  if (arg === true) return 1;
  if (arg === false) return 0;
  if (typeof arg === "string" && type?.scalarType === "datetime") return isoText(new Date(arg));
  if (arg instanceof Date) return isoText(arg);
  if (arg instanceof Uint8Array) return arg.slice().buffer;
  return arg;
}

function isoText(date: Date): string {
  return date.toISOString().replace("Z", "+00:00");
}
