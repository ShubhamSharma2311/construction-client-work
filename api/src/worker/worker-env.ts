import { z } from "zod";

const workerEnvSchema = z
  .object({
    // The website's address; reset links point here, and https means it is live.
    APP_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    RESEND_API_KEY: z.string().min(1).optional(),
    MAIL_FROM: z.string().min(3).default("Sawariya Seth <onboarding@resend.dev>"),
    // Set only to create the owner on a new install, then removed.
    SETUP_TOKEN: z.string().min(32, "SETUP_TOKEN must be at least 32 characters").optional(),
  })
  .refine((env) => !env.APP_URL.startsWith("https://") || env.RESEND_API_KEY !== undefined, {
    path: ["RESEND_API_KEY"],
    message: "RESEND_API_KEY is required once the app is live on https",
  });

export interface WorkerEnv {
  appUrl: string;
  jwtSecret: string;
  resendApiKey: string | undefined;
  mailFrom: string;
  setupToken: string | undefined;
  /** Served over https: cookies are Secure and emails really go out. */
  live: boolean;
}

/** The Worker's variables and secrets, checked once; the ledger must not start half-configured. */
export function loadWorkerEnv(source: Record<string, unknown>): WorkerEnv {
  const result = workerEnvSchema.safeParse(source);
  if (!result.success)
    throw new Error(`Invalid Worker settings:\n${z.prettifyError(result.error)}`);
  const env = result.data;
  return {
    appUrl: env.APP_URL,
    jwtSecret: env.JWT_SECRET,
    resendApiKey: env.RESEND_API_KEY,
    mailFrom: env.MAIL_FROM,
    setupToken: env.SETUP_TOKEN,
    live: env.APP_URL.startsWith("https://"),
  };
}
