export const ERROR_STATUS = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  IDEMPOTENCY_MISMATCH: 422,
  RATE_LIMITED: 429,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export type ErrorDetails = Readonly<Record<string, unknown>>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details: ErrorDetails | undefined;

  constructor(code: ErrorCode, message: string, details?: ErrorDetails) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = ERROR_STATUS[code];
    this.details = details;
  }
}

export function notFound(entity: string, id: number | string): AppError {
  return new AppError("NOT_FOUND", `${entity} #${String(id)} not found`);
}

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}
