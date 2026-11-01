import { beforeEach, describe, expect, it } from "vitest";
import { errorOf, OWNER, TEST_APP_URL, useTestApp } from "../../../test/app.ts";
import type { Email } from "../../lib/mailer.ts";
import { REFRESH_COOKIE } from "./refresh-cookie.ts";

const outbox: Email[] = [];
const mail = { failing: false };
const t = useTestApp({
  mailer: {
    send(email) {
      if (mail.failing) return Promise.reject(new Error("Resend is down"));
      outbox.push(email);
      return Promise.resolve();
    },
  },
});

const OWNER_EMAIL = "owner@example.com";

beforeEach(async () => {
  outbox.length = 0;
  mail.failing = false;
  await t.db.user.update({ where: { id: t.ownerId }, data: { email: OWNER_EMAIL } });
});

function forgot(username: string = OWNER.username) {
  return t.request({
    method: "POST",
    url: "/auth/forgot-password",
    body: { username },
    auth: false,
  });
}

function reset(token: string, newPassword = "a-brand-new-password") {
  return t.request({
    method: "POST",
    url: "/auth/reset-password",
    body: { token, newPassword },
    auth: false,
  });
}

function login(password: string) {
  return t.request({
    method: "POST",
    url: "/auth/login",
    body: { username: OWNER.username, password },
    auth: false,
  });
}

/** The token from the link in the latest email. */
function tokenFromOutbox(): string {
  const link = outbox.at(-1)?.text.match(/\/reset-password\?token=(\S+)/);
  if (!link?.[1]) throw new Error(`no reset link in ${JSON.stringify(outbox)}`);
  return link[1];
}

describe("POST /auth/forgot-password", () => {
  it("emails the owner a link to this app", async () => {
    await t.db.setting.create({
      data: {
        id: 1,
        businessName: "Sawariya Seth Construction Materials",
        businessStartDate: new Date("2026-04-01"),
      },
    });

    const response = await forgot();

    expect(response.statusCode).toBe(204);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).toBe(OWNER_EMAIL);
    expect(outbox[0]?.subject).toBe("Reset your Sawariya Seth Construction Materials password");
    expect(outbox[0]?.text).toContain(`${TEST_APP_URL}/reset-password?token=`);
    expect(outbox[0]?.text).toContain("30 minutes");
  });

  it("answers the same and sends nothing for an unknown name or an owner with no email", async () => {
    const unknown = await forgot("someone-else");
    await t.db.user.update({ where: { id: t.ownerId }, data: { email: null } });
    const noEmail = await forgot();

    expect(unknown.statusCode).toBe(204);
    expect(noEmail.statusCode).toBe(204);
    expect(outbox).toHaveLength(0);
  });

  it("allows three emails an hour, then asks to wait", async () => {
    for (let i = 0; i < 3; i++) expect((await forgot()).statusCode).toBe(204);

    const fourth = await forgot();

    expect(fourth.statusCode).toBe(429);
    expect(outbox).toHaveLength(3);
    t.setNow(new Date(t.now.getTime() + 61 * 60_000));
    expect((await forgot()).statusCode).toBe(204);
  });

  it("says the email could not be sent, and keeps no working link, when sending fails", async () => {
    mail.failing = true;

    const response = await forgot();

    expect(response.statusCode).toBe(503);
    expect(errorOf(response).message).toMatch(/could not send/i);
    expect(await t.db.passwordReset.count()).toBe(0);
  });
});

describe("POST /auth/reset-password", () => {
  it("sets the new password and signs out every session", async () => {
    const session = await login(OWNER.password);
    const refreshToken = session.cookies.find((c) => c.name === REFRESH_COOKIE)?.value ?? "";
    await forgot();

    const response = await reset(tokenFromOutbox());

    expect(response.statusCode).toBe(204);
    expect((await login(OWNER.password)).statusCode).toBe(401);
    expect((await login("a-brand-new-password")).statusCode).toBe(200);
    const refreshed = await t.request({
      method: "POST",
      url: "/auth/refresh",
      auth: false,
      headers: { cookie: `${REFRESH_COOKIE}=${refreshToken}` },
    });
    expect(refreshed.statusCode).toBe(401);
    const audit = await t.db.auditLog.findFirstOrThrow({ where: { entity: "User" } });
    expect(JSON.stringify(audit.after)).not.toContain("a-brand-new-password");
  });

  it("works only once", async () => {
    await forgot();
    const token = tokenFromOutbox();
    await reset(token);

    const again = await reset(token, "another-new-password");

    expect(again.statusCode).toBe(400);
    expect(errorOf(again).message).toMatch(/expired|used/);
  });

  it("stops working after 30 minutes", async () => {
    await forgot();
    t.setNow(new Date(t.now.getTime() + 31 * 60_000));

    expect((await reset(tokenFromOutbox())).statusCode).toBe(400);
  });

  it("stops an older link once a newer one is sent", async () => {
    await forgot();
    const older = tokenFromOutbox();
    await forgot();

    expect((await reset(older)).statusCode).toBe(400);
    expect((await reset(tokenFromOutbox())).statusCode).toBe(204);
  });

  it("rejects a made-up link and a short password", async () => {
    await forgot();

    expect((await reset("made-up-token")).statusCode).toBe(400);
    const short = await reset(tokenFromOutbox(), "short");
    expect(short.statusCode).toBe(400);
    expect(JSON.stringify(short.json())).toContain("at least 10");
  });
});

describe("PUT /auth/email", () => {
  it("sets the reset email after checking the password, and shows it on /auth/me", async () => {
    const response = await t.put("/auth/email", {
      email: "  Sawariya.Seth@Example.com ",
      currentPassword: OWNER.password,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ email: "sawariya.seth@example.com" });
    expect((await t.get("/auth/me")).json()).toMatchObject({ email: "sawariya.seth@example.com" });
  });

  it.each([
    ["the password is wrong", { email: "a@example.com", currentPassword: "wrong-pass-1" }, "wrong"],
    [
      "the email is not an email",
      { email: "not-an-email", currentPassword: OWNER.password },
      "email",
    ],
  ])("rejects with 400 when %s", async (_label, body, message) => {
    const response = await t.put("/auth/email", body);

    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(response.json()).toLowerCase()).toContain(message);
  });
});
