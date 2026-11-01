/** Where the API reports what went wrong; Cloudflare keeps console output with each request. */
export interface Log {
  error(details: Record<string, unknown>, message: string): void;
}

export const consoleLog: Log = {
  error(details, message) {
    console.error(message, details);
  },
};

/** For tests, where expected failures would only add noise. */
export const silentLog: Log = {
  error() {
    // Deliberately quiet: tests assert on responses, not on log lines.
  },
};
