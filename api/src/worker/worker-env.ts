import { z } from "zod";
import { type Mailer, printMailer, resendMailer } from "../lib/mailer.ts";

const workerEnvSchema = z.object({
  // The website's address; reset links point here, and https means it is live.
  APP_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z
    .string()
    .min(3)
    .default("Sawariya Seth Construction Materials <onboarding@resend.dev>"),
  // Set only to create the owner on a new install, then removed.
  SETUP_TOKEN: z.string().min(32, "SETUP_TOKEN must be at least 32 characters").optional(),
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

/**
 * Resend once its key is set. Live without one, every email fails and the owner is told it
 * was not sent; only a local run prints them, since a printed reset link is a working one.
 */
export function workerMailer(
  settings: WorkerEnv,
  write: (line: string) => void = (line) => {
    console.log(line);
  },
): Mailer {
  if (settings.resendApiKey) return resendMailer(settings.resendApiKey, settings.mailFrom);
  if (!settings.live) return printMailer(write);
  return {
    send() {
      return Promise.reject(new Error("Email is not set up: the RESEND_API_KEY secret is missing"));
    },
  };
}
