import { Hono } from "hono";
import type { Bot } from "grammy";
import { mountBotWebhook } from "./bot/index.ts";
import { createWebhookRoutes } from "./webhook/index.ts";
import type { WebhookHandlerDeps } from "./webhook/index.ts";

export interface AppOptions {
  bot?: Bot;
  webhook?: WebhookHandlerDeps;
}

export function createApp(opts?: AppOptions) {
  const app = new Hono();

  app.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  if (opts?.bot) {
    mountBotWebhook({ app, bot: opts.bot, path: "/webhook/telegram" });
  }

  if (opts?.webhook) {
    const webhookRoutes = createWebhookRoutes(opts.webhook);
    app.route("/webhook/deploy", webhookRoutes);
  } else {
    app.post("/webhook/deploy/:platform", (c) => {
      return c.json({ error: "Webhook handler not configured" }, 503);
    });
  }

  return app;
}
