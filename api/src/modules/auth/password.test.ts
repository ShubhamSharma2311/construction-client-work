import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.ts";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("reti-bajri-2026");

    expect(await verifyPassword("reti-bajri-2026", stored)).toBe(true);
    expect(await verifyPassword("reti-bajri-2027", stored)).toBe(false);
  });

  it("salts every hash, so the same password hashes differently", async () => {
    expect(await hashPassword("same-password")).not.toBe(await hashPassword("same-password"));
  });

  it("never stores the password itself", async () => {
    expect(await hashPassword("visible-secret")).not.toContain("visible-secret");
  });

  it("fails loudly on a corrupted stored hash", async () => {
    await expect(verifyPassword("x", "plaintext")).rejects.toThrow("scrypt$N$r$p$salt$hash");
  });
});
