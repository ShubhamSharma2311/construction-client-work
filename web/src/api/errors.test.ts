import { describe, expect, it } from "vitest";
import { unwrap } from "./client.ts";
import { toApiError } from "./errors.ts";

describe("API errors", () => {
  it("keeps the backend's code, message and request id", () => {
    const error = toApiError(new Response(null, { status: 409 }), {
      error: { code: "CONFLICT", message: "Trip amount below ₹3,000 received", requestId: "r-9" },
    });

    expect(error).toMatchObject({
      status: 409,
      code: "CONFLICT",
      message: "Trip amount below ₹3,000 received",
      requestId: "r-9",
    });
  });

  it.each([
    ["no body", undefined],
    ["an HTML error page", "<html>Bad gateway</html>"],
    ["an error without a message", { error: { code: "X" } }],
  ])("still reports the status when the server sends %s", (_label, body) => {
    expect(toApiError(new Response(null, { status: 502 }), body)).toMatchObject({
      status: 502,
      code: "UNEXPECTED",
      message: "Server answered 502",
    });
  });

  it("refuses to treat an empty success as data", () => {
    expect(() => unwrap({ response: new Response(null, { status: 200 }) })).toThrow(
      "Empty response",
    );
  });
});
