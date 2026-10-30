import type { paths } from "./schema.gen.ts";

/** The 200 or 201 body of a route, so screens and test fakes follow the API's own types. */
export type Ok<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  responses: { 200: { content: { "application/json": infer Body } } };
}
  ? Body
  : paths[P][M] extends { responses: { 201: { content: { "application/json": infer Body } } } }
    ? Body
    : never;

/** The JSON body a route accepts. */
export type BodyOf<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  requestBody?: { content: { "application/json": infer Body } };
}
  ? Body
  : never;

export type Dashboard = Ok<"/dashboard", "get">;
export type ExpenseItem = Ok<"/expenses", "get">["items"][number];
export type ExpenseCategory = ExpenseItem["category"];
