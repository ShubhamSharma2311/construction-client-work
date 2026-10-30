import { ApiError, isNetworkError } from "../api/errors.ts";
import { Button } from "./Button.tsx";
import styles from "./LoadState.module.css";
import { ErrorNotice } from "./Notice.tsx";

export function Loading({ what }: { what: string }) {
  return (
    <p className={styles.loading} aria-busy="true">
      Loading {what}…
    </p>
  );
}

/** Why something failed to load, in words that say what to do. */
export function loadErrorMessage(error: unknown): string {
  if (error instanceof ApiError)
    return error.message.endsWith(".") ? error.message : `${error.message}.`;
  if (isNetworkError(error)) return "Cannot reach the server. Check the internet connection.";
  return "Something went wrong on this screen. Try again, and tell whoever set up the app if it keeps happening.";
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  // Not the server's words and not the network: a bug here, so keep its details.
  if (!(error instanceof ApiError) && !isNetworkError(error)) console.error(error);
  return (
    <div className={styles.error}>
      <ErrorNotice>{loadErrorMessage(error)}</ErrorNotice>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
