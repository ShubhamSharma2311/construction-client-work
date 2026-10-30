import { useCallback, useState } from "react";
import { ApiError } from "./errors.ts";

/**
 * One key per entry being made. Retrying the same entry (a double tap, a dropped
 * connection) reuses it, so the server saves it once; `renew` starts the next entry.
 */
export function useIdempotencyKey(): { key: string; renew: () => void } {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const renew = useCallback(() => {
    setKey(crypto.randomUUID());
  }, []);
  return { key, renew };
}

/**
 * A mismatch means this entry was already saved before it was changed. The key is spent:
 * a fresh one lets the person go on, and the message has told them the first one is saved.
 */
export function renewAfterMismatch(error: unknown, renew: () => void): void {
  if (error instanceof ApiError && error.code === "IDEMPOTENCY_MISMATCH") renew();
}
