import { createHash, timingSafeEqual } from "node:crypto";

/** Compares a secret someone sent with the expected one, taking the same time for any guess. */
export function sameSecret(sent: string, expected: string): boolean {
  // Digests have equal length, so timingSafeEqual can compare them whatever was sent.
  return timingSafeEqual(digest(sent), digest(expected));
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
