import { Hono } from "hono";

export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  // TODO: Wire grammY webhook handler
  app.post("/webhook/telegram", (c) => {
    return c.json({ ok: true });
  });

  // TODO: Wire deploy webhook handlers
  app.post("/webhook/deploy/:platform", (c) => {
    const platform = c.req.param("platform");
    return c.json({ platform, received: true });
  });

  return app;
}
