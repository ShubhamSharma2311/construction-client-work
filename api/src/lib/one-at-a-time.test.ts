import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { oneRequestAtATime } from "./one-at-a-time.ts";

describe("oneRequestAtATime", () => {
  it("runs requests one after another, even when they arrive together", async () => {
    const app = new Hono();
    app.use(oneRequestAtATime());
    const order: string[] = [];
    app.get("/slow/:name", async (c) => {
      const name = c.req.param("name");
      order.push(`start ${name}`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(`end ${name}`);
      return c.json({ name });
    });

    await Promise.all(["a", "b", "c"].map(async (name) => app.request(`/slow/${name}`)));

    expect(order).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("moves on to the next request when one fails", async () => {
    const app = new Hono();
    app.use(oneRequestAtATime());
    app.get("/fail", () => {
      throw new Error("boom");
    });
    app.get("/ok", (c) => c.json({ ok: true }));

    const [failed, ok] = await Promise.all(["/fail", "/ok"].map(async (path) => app.request(path)));

    expect(failed?.status).toBe(500);
    expect(ok?.status).toBe(200);
  });
});
