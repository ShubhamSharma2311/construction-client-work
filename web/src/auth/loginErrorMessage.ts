import { ApiError } from "../api/errors.ts";

/** What to tell the person when sign in fails, in words that say what to do next. */
export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Wrong username or password.";
    if (error.status === 429) return "Too many wrong tries. Wait 15 minutes, then try again.";
    if (error.status === 400) return "Enter both your username and password.";
    return `The server could not sign you in (${error.code}). Try again in a minute.`;
  }
  return "Cannot reach the server. Check the internet connection and try again.";
}
