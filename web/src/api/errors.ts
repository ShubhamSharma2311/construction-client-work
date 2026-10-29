/** A failed API call, carrying the backend's error code so screens can word it for people. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

interface ErrorBody {
  error: { code: string; message: string; requestId?: string };
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

/** Builds an ApiError from whatever a failed response carried, keeping the backend's words. */
export function toApiError(response: Response, body: unknown): ApiError {
  if (isErrorBody(body)) {
    return new ApiError(response.status, body.error.code, body.error.message, body.error.requestId);
  }
  return new ApiError(response.status, "UNEXPECTED", `Server answered ${String(response.status)}`);
}
