// Wrangler bundles .sql files as text (the "rules" in wrangler.jsonc).
declare module "*.sql" {
  const text: string;
  export default text;
}
