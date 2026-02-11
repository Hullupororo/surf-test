import { Bot, webhookCallback } from "grammy";
import type { Hono } from "hono";
import type { AppConfig } from "../config/schema.ts";
import type { Storage } from "../storage/index.ts";
import type { TaskQueue } from "../queue/types.ts";
import { createAuthMiddleware } from "./auth.ts";
import { registerHandlers } from "./handlers.ts";
import { createChildLogger } from "../lib/logger.ts";

const log = createChildLogger("bot");

export function createBot(opts: {
  config: AppConfig;
  storage: Storage;
  queue: TaskQueue | null;
}) {
  const { config, storage, queue } = opts;
  const bot = new Bot(config.telegram.botToken);

  bot.use(createAuthMiddleware(config.telegram.allowedUsers));
  registerHandlers({ bot, storage, queue });

  log.info("Bot created");
  return bot;
}

export function mountBotWebhook(opts: { app: Hono; bot: Bot; path: string }) {
  const { app, bot, path } = opts;
  const handleUpdate = webhookCallback(bot, "std/http");

  app.post(path, async (c) => {
    try {
      const response = await handleUpdate(c.req.raw);
      return response;
    } catch (err) {
      log.error({ err }, "Webhook handler error");
      return c.json({ ok: false }, 500);
    }
  });

  log.info({ path }, "Bot webhook mounted");
}
