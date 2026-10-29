import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  hashRefreshToken,
  newRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "./tokens.ts";

const secret = "s".repeat(40);
const now = new Date("2026-10-28T06:30:00Z");

describe("access tokens", () => {
  it("round-trips the user id and expires after 15 minutes", async () => {
    const { token, expiresAt } = await signAccessToken(42, secret, now);

    expect(expiresAt.getTime() - now.getTime()).toBe(ACCESS_TOKEN_TTL_SECONDS * 1000);
    expect(await verifyAccessToken(token, secret, now)).toBe(42);
  });

  it("rejects an expired token", async () => {
    const { token } = await signAccessToken(42, secret, now);
    const later = new Date(now.getTime() + (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000);

    await expect(verifyAccessToken(token, secret, later)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects a token signed with another secret", async () => {
    const { token } = await signAccessToken(42, "o".repeat(40), now);

    await expect(verifyAccessToken(token, secret, now)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects a tampered payload", async () => {
    const { token } = await signAccessToken(42, secret, now);
    const [header, , signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: "1", iss: "sand-trip-ledger" }),
    ).toString("base64url");

    await expect(
      verifyAccessToken(`${header ?? ""}.${forgedPayload}.${signature ?? ""}`, secret, now),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects garbage and an unsigned token", async () => {
    await expect(verifyAccessToken("not.a.jwt", secret, now)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    const unsigned = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(
      '{"sub":"42","iss":"sand-trip-ledger"}',
    ).toString("base64url")}.`;
    await expect(verifyAccessToken(unsigned, secret, now)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects a validly signed token whose subject is not a user id", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("owner")
      .setIssuer("sand-trip-ledger")
      .setExpirationTime(Math.floor(now.getTime() / 1000) + 60)
      .sign(new TextEncoder().encode(secret));

    await expect(verifyAccessToken(token, secret, now)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("refresh tokens", () => {
  it("are random and stored only as a hash", () => {
    const first = newRefreshToken();
    const second = newRefreshToken();

    expect(first.token).not.toBe(second.token);
    expect(first.hash).toBe(hashRefreshToken(first.token));
    expect(first.hash).not.toContain(first.token);
  });
});
