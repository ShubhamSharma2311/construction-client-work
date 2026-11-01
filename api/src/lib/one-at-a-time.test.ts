import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { oneRequestAtATime } from "./one-at-a-time.ts";

describe("oneRequestAtATime", () => {
  it("runs requests one after another, even when they arrive together", async () => {
    const app = Fastify();
    oneRequestAtATime(app);
    const order: string[] = [];
    app.get("/slow/:name", async (request) => {
      const { name } = request.params as { name: string };
      order.push(`start ${name}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(`end ${name}`);
      return { name };
    });

    await Promise.all(["a", "b", "c"].map((name) => app.inject(`/slow/${name}`)));

    expect(order).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("moves on to the next request when one fails", async () => {
    const app = Fastify();
    oneRequestAtATime(app);
    app.get("/fail", () => {
      throw new Error("boom");
    });
    app.get("/ok", () => ({ ok: true }));

    const [failed, ok] = await Promise.all([app.inject("/fail"), app.inject("/ok")]);

    expect(failed.statusCode).toBe(500);
    expect(ok.statusCode).toBe(200);
  });
});
