import { buildOpenApiSpec } from "../openapi.ts";

// Usage: npm run --silent openapi > openapi.json
process.stdout.write(`${JSON.stringify(await buildOpenApiSpec(), null, 2)}\n`);
