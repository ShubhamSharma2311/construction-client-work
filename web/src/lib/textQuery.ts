/** A typed API query as text, for a download link that carries the same filters. */
export function asTextQuery(query: Record<string, string | number>): Record<string, string> {
  return Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)]));
}
