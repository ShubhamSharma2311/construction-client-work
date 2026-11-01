import { $ZodRegistry, type $ZodType, toJSONSchema } from "zod/v4/core";
import type { RouteDef } from "./route.ts";

type Json = Record<string, unknown>;
type Io = "input" | "output";

// OpenAPI 3.0, which the frontend's type generator reads.
const TARGET = "openapi-3.0";
// Keywords zod adds to a schema's root, and ones OpenAPI 3.0 does not have.
const REMOVED = new Set([
  "id",
  "$id",
  "$schema",
  "unevaluatedProperties",
  "dependentSchemas",
  "patternProperties",
  "propertyNames",
  "contentEncoding",
  "contentMediaType",
]);
const ONE_SCHEMA = new Set(["items", "additionalProperties", "not"]);
const SCHEMA_LIST = new Set(["allOf", "anyOf", "oneOf"]);
const PLACEHOLDER = "__SCHEMA__";

/** The API's OpenAPI document, built from the same route list the app serves. */
export function describeRoutes(
  routes: readonly RouteDef[],
  info: { title: string; version: string },
) {
  const paths: Record<string, Record<string, Json>> = {};
  for (const route of routes) {
    const path = route.path.replace(/:(\w+)/g, "{$1}");
    paths[path] = { ...paths[path], [route.method]: operation(route) };
  }
  return { openapi: "3.0.3", info, components: { schemas: {} }, paths };
}

function operation(route: RouteDef): Json {
  const { params, query, body, response } = route.schemas;
  const parameters = [
    ...parametersOf(query, "query", false),
    ...parametersOf(params, "path", true),
  ];
  const op: Json = {};
  if (parameters.length > 0) op["parameters"] = parameters;
  if (body) {
    op["requestBody"] = {
      required: true,
      content: { "application/json": { schema: toJson(body, "input") } },
    };
  }
  const statuses = Object.entries(response ?? {});
  op["responses"] =
    statuses.length === 0
      ? { "200": { description: "Default Response" } }
      : Object.fromEntries(
          statuses.map(([status, schema]) => [
            status,
            {
              description: "Default Response",
              content: { "application/json": { schema: toJson(schema as $ZodType, "output") } },
            },
          ]),
        );
  return op;
}

function parametersOf(
  schema: $ZodType | undefined,
  where: "query" | "path",
  always: boolean,
): Json[] {
  if (!schema) return [];
  const json = toJson(schema, "input");
  const properties = (json["properties"] ?? {}) as Record<string, Json>;
  const required = new Set((json["required"] ?? []) as string[]);
  return Object.entries(properties).map(([name, property]) => ({
    schema: property,
    in: where,
    name,
    required: always || required.has(name),
  }));
}

/** A zod schema as OpenAPI 3.0 JSON schema, inlined, with nullable unions folded. */
function toJson(schema: $ZodType, io: Io): Json {
  // toJSONSchema only names a root through a registry; a one-entry registry does that.
  const registry = new $ZodRegistry<{ id: string }>();
  registry.add(schema, { id: PLACEHOLDER });
  const result = toJSONSchema(registry, {
    target: TARGET,
    io,
    unrepresentable: "any",
    cycles: "ref",
    reused: "inline",
    uri: () => PLACEHOLDER,
    override: (ctx) => {
      fold(ctx.zodSchema, ctx.jsonSchema, io);
    },
  }).schemas[PLACEHOLDER];
  return sanitize(result) as Json;
}

/** OpenAPI 3.0 has no null type: "X or null" becomes X marked nullable. */
function fold(zodSchema: $ZodType, json: Json, io: Io): void {
  const type = zodSchema._zod.def.type;
  if (type === "union" && Array.isArray(json["anyOf"])) {
    const branches = (json["anyOf"] as Json[]).filter((branch) => Object.keys(branch).length > 0);
    json["anyOf"] = branches;
    const isNull = (branch: Json) =>
      branch["nullable"] === true &&
      Array.isArray(branch["enum"]) &&
      branch["enum"].length === 1 &&
      branch["enum"][0] === null;
    const others = branches.filter((branch) => !isNull(branch));
    if (others.length < branches.length && others.length === 1) {
      delete json["anyOf"];
      Object.assign(json, others[0], { nullable: true });
    } else if (others.length < branches.length && others.length > 1) {
      json["anyOf"] = others;
      json["nullable"] = true;
    }
  }
  if (type === "date" && io === "output")
    Object.assign(json, { type: "string", format: "date-time" });
  if (type === "undefined" && io === "output") json["type"] = "null";
}

/** Drops removed keywords, walking only where subschemas live (a property may be called "id"). */
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value === null || typeof value !== "object") return value;
  const out: Json = {};
  for (const [key, child] of Object.entries(value)) {
    if (REMOVED.has(key)) continue;
    if (key === "properties" && child !== null && typeof child === "object") {
      out[key] = Object.fromEntries(
        Object.entries(child as Json).map(([name, property]) => [name, sanitize(property)]),
      );
    } else if (ONE_SCHEMA.has(key) || SCHEMA_LIST.has(key)) {
      out[key] = sanitize(child);
    } else {
      out[key] = child;
    }
  }
  return out;
}
