import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password.ts";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,50}$/, "username must be 3-50 letters, digits, '.', '_' or '-'");

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH);

export const loginBody = z.object({
  username: z.string().trim().toLowerCase().min(1).max(50),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginBody>;

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: newPasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordBody>;

export const sessionResponse = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: z.iso.datetime(),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.iso.datetime(),
});
export type Session = z.infer<typeof sessionResponse>;

/** What the browser sees: the refresh token travels only in an HttpOnly cookie. */
export const browserSessionResponse = sessionResponse.pick({
  accessToken: true,
  accessTokenExpiresAt: true,
});
export type BrowserSession = z.infer<typeof browserSessionResponse>;

export const forgotPasswordBody = z.object({ username: loginBody.shape.username });

export const resetPasswordBody = z.object({
  token: z.string().min(1).max(200),
  newPassword: newPasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordBody>;

export const setEmailBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("enter a valid email address").max(254)),
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type SetEmailInput = z.infer<typeof setEmailBody>;

export const meResponse = z.object({
  id: z.number().int(),
  username: z.string(),
  /** Where "forgot password" sends the link; null when none is set. */
  email: z.string().nullable(),
});
export type Me = z.infer<typeof meResponse>;
