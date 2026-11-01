import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(0).max(65535),
  DATABASE_URL: z.string().startsWith("file:", "DATABASE_URL must be a SQLite file: URL"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  CORS_ORIGINS: z
    .string()
    .transform((value) => value.split(",").map((origin) => origin.trim()))
    .pipe(z.array(z.url()).min(1)),
  // The app's public address; "forgot password" links point here.
  APP_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
  // Without a key, emails are only written to the log, which production must never do.
  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(3).default("Sawariya Seth <onboarding@resend.dev>"),
});

const productionNeeds = envSchema.refine(
  (env) => env.NODE_ENV !== "production" || env.RESEND_API_KEY !== undefined,
  {
    path: ["RESEND_API_KEY"],
    message: "RESEND_API_KEY is required in production",
  },
);

export type Env = z.infer<typeof envSchema>;

/** Reads and validates the environment; the server must not start half-configured. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = productionNeeds.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
