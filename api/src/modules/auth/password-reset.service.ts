import { writeAudit } from "../../lib/audit.ts";
import { AppError } from "../../lib/errors.ts";
import type { Mailer } from "../../lib/mailer.ts";
import type { Db } from "../../lib/prisma.ts";
import type { Me, ResetPasswordInput, SetEmailInput } from "./auth.schema.ts";
import { accountGone, revokeAllForUser } from "./auth.service.ts";
import { hashPassword, verifyPassword } from "./password.ts";
// A reset token has the same shape as a refresh token: random, with only its SHA-256 stored.
import { hashRefreshToken, newRefreshToken } from "./tokens.ts";

export const RESET_LINK_TTL_MINUTES = 30;
export const RESET_EMAILS_PER_HOUR = 3;

export interface ResetRequest {
  username: string;
  appUrl: string;
}

/**
 * Emails the owner a one-time link to choose a new password. An unknown name or an
 * owner with no email gets the same quiet answer, so the reply never says who exists.
 */
export async function requestPasswordReset(
  db: Db,
  mailer: Mailer,
  request: ResetRequest,
  now: Date,
): Promise<void> {
  const user = await db.user.findUnique({ where: { username: request.username } });
  if (!user?.email) return;

  const hourAgo = new Date(now.getTime() - 3_600_000);
  const recent = await db.passwordReset.count({
    where: { userId: user.id, createdAt: { gt: hourAgo } },
  });
  if (recent >= RESET_EMAILS_PER_HOUR) {
    throw new AppError("RATE_LIMITED", "Too many reset emails; try again in an hour");
  }

  const { token, hash } = newRefreshToken();
  const reset = await db.$transaction(async (tx) => {
    // Only the newest link works, so an older email lying in the inbox is harmless.
    await tx.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    return tx.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(now.getTime() + RESET_LINK_TTL_MINUTES * 60_000),
        createdAt: now,
      },
    });
  });

  const settings = await db.setting.findUnique({ where: { id: 1 } });
  try {
    await mailer.send(
      resetEmail(user.email, user.username, settings?.businessName, request.appUrl, token),
    );
  } catch (cause) {
    // A link nobody received must not count against the hourly limit or stay usable.
    await db.passwordReset.delete({ where: { id: reset.id } });
    throw new AppError(
      "UNAVAILABLE",
      "Could not send the reset email; try again in a few minutes",
      undefined,
      { cause },
    );
  }
}

function resetEmail(
  to: string,
  username: string,
  businessName: string | undefined,
  appUrl: string,
  token: string,
) {
  const app = businessName ?? "your ledger";
  return {
    to,
    subject: `Reset your ${app} password`,
    text: [
      `Someone asked to reset the password for "${username}" on ${app}.`,
      "",
      `Open this link within ${String(RESET_LINK_TTL_MINUTES)} minutes to choose a new password:`,
      `${appUrl}/reset-password?token=${token}`,
      "",
      "The link works once. If you did not ask for this, ignore this email; your password stays the same.",
    ].join("\n"),
  };
}

function invalidLink(): AppError {
  return new AppError(
    "VALIDATION",
    "This reset link has expired or was already used; ask for a new one",
  );
}

/** Sets the password from an emailed link and signs out every session. */
export async function resetPassword(db: Db, input: ResetPasswordInput, now: Date): Promise<void> {
  const reset = await db.passwordReset.findUnique({
    where: { tokenHash: hashRefreshToken(input.token) },
  });
  if (!reset) throw invalidLink();
  const passwordHash = await hashPassword(input.newPassword);

  await db.$transaction(async (tx) => {
    // Updating the user row first serialises this against refreshSession, as changePassword does.
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
    const { count } = await tx.passwordReset.updateMany({
      where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count === 0) throw invalidLink();
    await revokeAllForUser(tx, reset.userId, now);
    await writeAudit(tx, {
      entity: "User",
      entityId: reset.userId,
      action: "UPDATE",
      after: { passwordResetByEmail: now },
    });
  });
}

/** Sets where reset links go. Needs the current password, so a borrowed session cannot. */
export async function setOwnerEmail(db: Db, userId: number, input: SetEmailInput): Promise<Me> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw accountGone();
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AppError("VALIDATION", "Current password is wrong");
  }
  return db.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: userId }, data: { email: input.email } });
    await writeAudit(tx, {
      entity: "User",
      entityId: userId,
      action: "UPDATE",
      before: { email: user.email },
      after: { email: input.email },
    });
    return { id: updated.id, username: updated.username, email: updated.email };
  });
}
