export interface Issue {
  path: string;
  message: string;
}

/** A failed API call, carrying the backend's error code so screens can word it for people. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;
  /** Field-level problems from a 400, e.g. { path: "body/amount", message: "..." }. */
  readonly issues: Issue[];

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
    issues: Issue[] = [],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.issues = issues;
  }
}

interface ErrorBody {
  error: { code: string; message: string; requestId?: string; details?: unknown };
}

function isErrorBody(body: unknown): body is ErrorBody {
  if (typeof body !== "object" || body === null || !("error" in body)) return false;
  const { error } = body;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  );
}

function isIssue(value: unknown): value is Issue {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    "message" in value &&
    typeof value.message === "string"
  );
}

function issuesOf(details: unknown): Issue[] {
  if (typeof details !== "object" || details === null || !("issues" in details)) return [];
  return Array.isArray(details.issues) ? details.issues.filter(isIssue) : [];
}

/** fetch rejects with a TypeError when the request never got an answer (offline, DNS, CORS). */
export function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

/** Builds an ApiError from whatever a failed response carried, keeping the backend's words. */
export function toApiError(response: Response, body: unknown): ApiError {
  if (isErrorBody(body)) {
    const { code, message, requestId, details } = body.error;
    return new ApiError(response.status, code, message, requestId, issuesOf(details));
  }
  return new ApiError(response.status, "UNEXPECTED", `Server answered ${String(response.status)}`);
}

/**
 * The first problem for each field, keyed the way forms name them: "body/amount" is
 * "amount", "body/payment/paidAmount" is "payment.paidAmount", "query/from" is
 * "query.from", and a problem with the whole body is "form".
 */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const byField: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.replace(/^body\/?/, "").replaceAll("/", ".") || "form";
    byField[field] ??= issue.message;
  }
  return byField;
}
