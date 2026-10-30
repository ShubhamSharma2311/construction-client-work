import { ApiError, isNetworkError } from "./errors.ts";

/** What to tell the person when a save fails, so they know whether it went through. */
export function saveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "IDEMPOTENCY_MISMATCH") {
      return "This entry was already saved with different details. Check the list before saving again.";
    }
    if (error.status === 400 && error.issues.length > 0)
      return "Some details need fixing. See the marked fields.";
    return error.message.endsWith(".") ? error.message : `${error.message}.`;
  }
  if (isNetworkError(error)) {
    return "Cannot reach the server. Save again once connected; it will not be entered twice.";
  }
  console.error(error);
  return "Something went wrong while saving. Check the list before trying again.";
}
