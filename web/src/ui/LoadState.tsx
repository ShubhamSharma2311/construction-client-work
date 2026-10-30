import { ApiError } from "../api/errors.ts";
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
  if (error instanceof ApiError) return `${error.message}.`.replace(/\.\.$/, ".");
  return "Cannot reach the server. Check the internet connection.";
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className={styles.error}>
      <ErrorNotice>{loadErrorMessage(error)}</ErrorNotice>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
