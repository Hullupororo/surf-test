import { Hono } from "hono";
import type { Bot } from "grammy";
import { mountBotWebhook } from "./bot/index.ts";

export function createApp(opts?: { bot?: Bot }) {
  const app = new Hono();

  app.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  if (opts?.bot) {
    mountBotWebhook({ app, bot: opts.bot, path: "/webhook/telegram" });
  }

  // TODO: Phase 6 — Wire deploy webhook handlers
  app.post("/webhook/deploy/:platform", (c) => {
    const platform = c.req.param("platform");
    return c.json({ platform, received: true });
  });

  return app;
}
