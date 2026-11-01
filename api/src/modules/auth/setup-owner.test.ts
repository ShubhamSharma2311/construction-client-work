import { describe, expect, it } from "vitest";
import { useTestApp } from "../../../test/app.ts";

const SETUP_TOKEN = "s".repeat(40);
const t = useTestApp({ setupToken: SETUP_TOKEN });

function setup(body: Record<string, string>) {
  return t.request({ method: "POST", url: "/auth/setup-owner", body, auth: false });
}

describe("POST /auth/setup-owner", () => {
  it("creates the owner once on a fresh ledger, with the setup token", async () => {
    await t.db.user.deleteMany();

    const created = await setup({
      setupToken: SETUP_TOKEN,
      username: "Sawariya",
      password: "first-password-1",
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ username: "sawariya", email: null });
    const login = await t.request({
      method: "POST",
      url: "/auth/login",
      body: { username: "sawariya", password: "first-password-1" },
      auth: false,
    });
    expect(login.statusCode).toBe(200);
  });

  it("refuses once an owner exists", async () => {
    const second = await setup({
      setupToken: SETUP_TOKEN,
      username: "intruder",
      password: "another-password-1",
    });

    expect(second.statusCode).toBe(409);
  });

  it("refuses a wrong setup token without creating anyone", async () => {
    await t.db.user.deleteMany();

    const wrong = await setup({
      setupToken: "x".repeat(40),
      username: "intruder",
      password: "another-password-1",
    });

    expect(wrong.statusCode).toBe(401);
    expect(await t.db.user.count()).toBe(0);
  });
});

describe("without a setup token configured", () => {
  const plain = useTestApp();

  it("has no setup route at all", async () => {
    const response = await plain.request({
      method: "POST",
      url: "/auth/setup-owner",
      body: { setupToken: SETUP_TOKEN, username: "x", password: "first-password-1" },
      auth: false,
    });

    expect(response.statusCode).toBe(404);
  });
});
