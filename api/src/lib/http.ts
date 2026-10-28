import type { FastifyReply } from "fastify";

/** "trips_2026-10-01_to_2026-10-31.csv": what the file holds and for which dates. */
export function csvFileName(subject: string, range: { from?: string; to?: string }): string {
  const from = range.from ? `_${range.from}` : "";
  const to = range.to ? `_to_${range.to}` : "";
  return `${subject}${from}${to}.csv`;
}

/** Sends a CSV download under the given file name. */
export function sendCsv(reply: FastifyReply, fileName: string, csv: string): FastifyReply {
  return reply
    .type("text/csv; charset=utf-8")
    .header("content-disposition", `attachment; filename="${fileName}"`)
    .send(csv);
}

/** Replies with a stored or fresh idempotent result; a replay is marked so clients can tell. */
export function sendIdempotent(
  reply: FastifyReply,
  result: { statusCode: number; body: unknown; replayed: boolean },
): FastifyReply {
  if (result.replayed) reply.header("idempotent-replay", "true");
  return reply.status(result.statusCode).send(result.body);
}
