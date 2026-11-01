export interface Email {
  to: string;
  subject: string;
  text: string;
}

/** Sends one email or throws; callers decide what a failure means for their request. */
export interface Mailer {
  send(email: Email): Promise<void>;
}

const RESEND_URL = "https://api.resend.com/emails";

/** Sends through Resend's HTTP API. */
export function resendMailer(apiKey: string, from: string, fetchFn: typeof fetch = fetch): Mailer {
  return {
    async send(email) {
      const response = await fetchFn(RESEND_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text }),
      });
      if (!response.ok) {
        throw new Error(
          `Resend refused the email (${String(response.status)}): ${await response.text()}`,
        );
      }
    },
  };
}

/** For local development: the email, link included, is printed instead of sent. */
export function printMailer(
  write: (line: string) => void = (line) => process.stdout.write(line),
): Mailer {
  return {
    send(email) {
      write(
        `Email not sent (no RESEND_API_KEY). To ${email.to}: ${email.subject}\n${email.text}\n`,
      );
      return Promise.resolve();
    },
  };
}
