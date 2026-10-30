import { useCallback, useState } from "react";

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
