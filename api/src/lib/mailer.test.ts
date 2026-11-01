import { describe, expect, it } from "vitest";
import { printMailer, resendMailer } from "./mailer.ts";

const EMAIL = { to: "owner@example.com", subject: "Hello", text: "Body" };

describe("resendMailer", () => {
  it("posts the email to Resend with the API key", async () => {
    const sent: Request[] = [];
    const mailer = resendMailer("re_test_key", "Ledger <onboarding@resend.dev>", (input, init) => {
      sent.push(new Request(input, init));
      return Promise.resolve(Response.json({ id: "email-1" }));
    });

    await mailer.send(EMAIL);

    const request = sent[0];
    expect(request?.url).toBe("https://api.resend.com/emails");
    expect(request?.headers.get("authorization")).toBe("Bearer re_test_key");
    expect(await request?.json()).toEqual({
      from: "Ledger <onboarding@resend.dev>",
      to: ["owner@example.com"],
      subject: "Hello",
      text: "Body",
    });
  });

  it("throws with Resend's reason when the email is refused", async () => {
    const mailer = resendMailer("re_test_key", "Ledger <onboarding@resend.dev>", () =>
      Promise.resolve(new Response('{"message":"Invalid to address"}', { status: 422 })),
    );

    await expect(mailer.send(EMAIL)).rejects.toThrow(/422.*Invalid to address/);
  });
});

describe("printMailer", () => {
  it("prints the whole email so a developer can follow the link", async () => {
    const lines: string[] = [];
    await printMailer((line) => lines.push(line)).send(EMAIL);

    expect(lines.join("")).toContain("To owner@example.com: Hello\nBody");
  });
});

describe("resendMailer when Resend does not answer", () => {
  it("gives up after its time limit instead of holding every other request", async () => {
    const mailer = resendMailer(
      "re_test_key",
      "Ledger <onboarding@resend.dev>",
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason as Error);
          });
        }),
      20,
    );

    await expect(mailer.send(EMAIL)).rejects.toThrow(/timed out|aborted/i);
  });
});
