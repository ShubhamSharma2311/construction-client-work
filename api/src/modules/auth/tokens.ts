import { createHash, randomBytes } from "node:crypto";
import { errors as joseErrors, jwtVerify, SignJWT } from "jose";
import { AppError } from "../../lib/errors.ts";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;

const ISSUER = "sawariya-seth-construction-materials";
const ALGORITHM = "HS256";

function keyFrom(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export interface AccessToken {
  token: string;
  expiresAt: Date;
}

export async function signAccessToken(
  userId: number,
  secret: string,
  now: Date,
): Promise<AccessToken> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAtSeconds = issuedAt + ACCESS_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(String(userId))
    .setIssuer(ISSUER)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAtSeconds)
    .sign(keyFrom(secret));
  return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
}

/** Returns the user id; every way a token can be bad becomes one 401. */
export async function verifyAccessToken(token: string, secret: string, now: Date): Promise<number> {
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), {
      issuer: ISSUER,
      algorithms: [ALGORITHM],
      currentDate: now,
    });
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) throw new joseErrors.JWTInvalid("bad subject");
    return userId;
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) {
      throw new AppError("UNAUTHORIZED", "Session is invalid or expired; log in again");
    }
    throw error;
  }
}

/** Opaque random refresh token; only its SHA-256 is stored. */
export function newRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
