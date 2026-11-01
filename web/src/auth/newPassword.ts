// The API's own minimum; checked here too so the owner hears it before sending.
export const NEW_PASSWORD_MIN_LENGTH = 10;

export interface NewPasswordProblems {
  newPassword?: string;
  repeat?: string;
}

/** What is wrong with a new password typed twice, if anything. */
export function newPasswordProblems(next: string, repeat: string): NewPasswordProblems {
  if (next.length < NEW_PASSWORD_MIN_LENGTH)
    return { newPassword: `Use at least ${String(NEW_PASSWORD_MIN_LENGTH)} characters` };
  if (next !== repeat) return { repeat: "The two new passwords are not the same" };
  return {};
}
