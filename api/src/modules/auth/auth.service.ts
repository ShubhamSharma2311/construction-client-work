import { randomUUID } from "node:crypto";
import { writeAudit } from "../../lib/audit.ts";
import { AppError } from "../../lib/errors.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import { parseOrThrow } from "../../lib/validation.ts";
import {
  newPasswordSchema,
  usernameSchema,
  type ChangePasswordInput,
  type LoginInput,
  type Me,
  type Session,
} from "./auth.schema.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import {
  hashRefreshToken,
  newRefreshToken,
  REFRESH_TOKEN_TTL_DAYS,
  signAccessToken,
} from "./tokens.ts";

export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_ATTEMPT_RETENTION_HOURS = 24;

const WRONG_CREDENTIALS = "Wrong username or password";

// Unknown usernames still pay for one hash check, so response time does not reveal them.
let timingDummyHash: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  timingDummyHash ??= hashPassword("timing-equaliser-password");
  return timingDummyHash;
}

export interface OwnerCredentials {
  username: string;
  password: string;
}

/** The panel has exactly one login: the owner. */
export async function createOwner(db: Db, input: OwnerCredentials): Promise<Me> {
  const username = parseOrThrow(usernameSchema, input.username);
  const password = parseOrThrow(newPasswordSchema, input.password);
  const passwordHash = await hashPassword(password);

  return db.$transaction(async (tx) => {
    // Serialises concurrent attempts so two owners can never be created.
    await tx.$executeRaw`LOCK TABLE "User" IN EXCLUSIVE MODE`;
    if ((await tx.user.count()) > 0) {
      throw new AppError(
        "CONFLICT",
        "An owner account already exists; use --reset to change its password",
      );
    }
    const user = await tx.user.create({ data: { username, passwordHash } });
    await writeAudit(tx, {
      entity: "User",
      entityId: user.id,
      action: "CREATE",
      after: { username },
    });
    return { id: user.id, username: user.username, email: user.email };
  });
}

/** Sets a new password for the owner and signs out every session. */
export async function resetOwnerPassword(db: Db, input: OwnerCredentials, now: Date): Promise<Me> {
  const username = parseOrThrow(usernameSchema, input.username);
  const passwordHash = await hashPassword(parseOrThrow(newPasswordSchema, input.password));

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { username } });
    if (!user) throw new AppError("NOT_FOUND", `No owner account named "${username}"`);
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await revokeAllForUser(tx, user.id, now);
    await cancelPendingResets(tx, user.id, now);
    await writeAudit(tx, {
      entity: "User",
      entityId: user.id,
      action: "UPDATE",
      after: { passwordReset: now },
    });
    return { id: user.id, username: user.username, email: user.email };
  });
}

export async function login(
  db: Db,
  input: LoginInput & { ip: string },
  jwtSecret: string,
  now: Date,
): Promise<Session> {
  const userId = await db.$transaction(async (tx) => {
    // One login per IP at a time, so a parallel burst cannot all read the same failure count.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.ip}))`;
    await assertLoginAllowed(tx, input.ip, now);
    const user = await tx.user.findUnique({ where: { username: input.username } });
    const passwordOk = await checkPassword(input.password, user?.passwordHash);
    await recordLoginAttempt(
      tx,
      { ip: input.ip, username: input.username, succeeded: passwordOk },
      now,
    );
    return user && passwordOk ? user.id : null;
  });

  if (userId === null) throw new AppError("UNAUTHORIZED", WRONG_CREDENTIALS);
  return db.$transaction((tx) => issueSession(tx, userId, randomUUID(), jwtSecret, now));
}

async function assertLoginAllowed(tx: Tx, ip: string, now: Date): Promise<void> {
  const windowStart = new Date(now.getTime() - LOGIN_WINDOW_MINUTES * 60_000);
  const recentFailures = await tx.loginAttempt.count({
    where: { ip, succeeded: false, at: { gt: windowStart } },
  });
  if (recentFailures >= LOGIN_FAILURE_LIMIT) {
    throw new AppError(
      "RATE_LIMITED",
      `Too many failed logins; try again in ${LOGIN_WINDOW_MINUTES} minutes`,
    );
  }
}

/** Unknown users are checked against a dummy hash so timing does not reveal them. */
async function checkPassword(password: string, storedHash: string | undefined): Promise<boolean> {
  if (storedHash === undefined) {
    await verifyPassword(password, await dummyHash());
    return false;
  }
  return verifyPassword(password, storedHash);
}

async function recordLoginAttempt(
  tx: Tx,
  attempt: { ip: string; username: string; succeeded: boolean },
  now: Date,
): Promise<void> {
  const retentionStart = new Date(now.getTime() - LOGIN_ATTEMPT_RETENTION_HOURS * 3_600_000);
  await tx.loginAttempt.deleteMany({ where: { at: { lt: retentionStart } } });
  await tx.loginAttempt.create({ data: { ...attempt, at: now } });
}

/**
 * Swaps a refresh token for a new session. Each refresh token works once; presenting
 * an already-used one means it was copied, so that whole login is signed out. Two
 * refreshes racing with one token look exactly like that, so the client must not
 * refresh in parallel.
 */
export async function refreshSession(
  db: Db,
  refreshToken: string | undefined,
  jwtSecret: string,
  now: Date,
): Promise<Session> {
  if (refreshToken === undefined) throw invalidSession();
  const tokenHash = hashRefreshToken(refreshToken);
  const known = await db.refreshToken.findUnique({ where: { tokenHash } });
  if (!known) throw invalidSession();

  const session = await db.$transaction(async (tx) => {
    // Password change and reset update this row first, so a refresh runs wholly before
    // or wholly after them and can never mint a token they fail to revoke.
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${known.userId} FOR UPDATE`;
    const { count } = await tx.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    if (count === 0) return null;
    return issueSession(tx, known.userId, known.familyId, jwtSecret, now);
  });
  if (session) return session;

  const latest = await db.refreshToken.findUniqueOrThrow({ where: { tokenHash } });
  if (latest.revokedAt) await revokeFamily(db, latest.familyId, now);
  throw invalidSession();
}

export function accountGone(): AppError {
  return new AppError("UNAUTHORIZED", "Account no longer exists; log in again");
}

function invalidSession(): AppError {
  return new AppError("UNAUTHORIZED", "Session is invalid or expired; log in again");
}

/** Signs out the login that owns this refresh token. Unknown tokens are already signed out. */
export async function logout(db: Db, refreshToken: string | undefined, now: Date): Promise<void> {
  if (refreshToken === undefined) return;
  const known = await db.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
  });
  if (known) await revokeFamily(db, known.familyId, now);
}

export async function changePassword(
  db: Db,
  userId: number,
  input: ChangePasswordInput,
  now: Date,
): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw accountGone();
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AppError("VALIDATION", "Current password is wrong");
  }
  if (input.newPassword === input.currentPassword) {
    throw new AppError("VALIDATION", "New password must differ from the current one");
  }
  const passwordHash = await hashPassword(input.newPassword);

  await db.$transaction(async (tx) => {
    // Updating the user row first is what serialises this against refreshSession.
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await revokeAllForUser(tx, userId, now);
    await cancelPendingResets(tx, userId, now);
    await writeAudit(tx, {
      entity: "User",
      entityId: userId,
      action: "UPDATE",
      after: { passwordChanged: now },
    });
  });
}

export async function getMe(db: Db, userId: number): Promise<Me> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw accountGone();
  return { id: user.id, username: user.username, email: user.email };
}

async function issueSession(
  tx: Tx,
  userId: number,
  familyId: string,
  jwtSecret: string,
  now: Date,
): Promise<Session> {
  const access = await signAccessToken(userId, jwtSecret, now);
  const refresh = newRefreshToken();
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await tx.refreshToken.create({
    data: { userId, familyId, tokenHash: refresh.hash, expiresAt: refreshExpiresAt },
  });
  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
  };
}

async function revokeFamily(db: Db | Tx, familyId: string, now: Date): Promise<void> {
  await db.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: now },
  });
}

/** Unused "forgot password" links stop working; called whenever the password or email changes. */
export async function cancelPendingResets(tx: Tx, userId: number, now: Date): Promise<void> {
  await tx.passwordReset.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: now },
  });
}

export async function revokeAllForUser(tx: Tx, userId: number, now: Date): Promise<void> {
  await tx.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });
}
