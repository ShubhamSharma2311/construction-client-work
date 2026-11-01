import { type Reply, respond } from "./route.ts";

/** "trips_2026-10-01_to_2026-10-31.csv": what the file holds and for which dates. */
export function csvFileName(subject: string, range: { from?: string; to?: string }): string {
  const from = range.from ? `_${range.from}` : "";
  const to = range.to ? `_to_${range.to}` : "";
  return `${subject}${from}${to}.csv`;
}

/** A CSV download under the given file name. */
export function sendCsv(fileName: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName}"`,
    },
  });
}

/** Replies with a stored or fresh idempotent result; a replay is marked so clients can tell. */
export function sendIdempotent(result: {
  statusCode: number;
  body: unknown;
  replayed: boolean;
}): Reply {
  return respond(
    result.statusCode,
    result.body,
    result.replayed ? { "idempotent-replay": "true" } : {},
  );
}
