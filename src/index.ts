import { mkdirSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./server.ts";
import { createBot, startPolling, registerWebhook } from "./bot/index.ts";
import { loadConfig } from "./config/index.ts";
import { createMemoryStorage } from "./storage/memory.ts";
import { createSqliteStorage } from "./storage/sqlite.ts";
import { createGitManager } from "./git/index.ts";
import { createTaskQueue } from "./queue/index.ts";
import { createTaskHandler } from "./queue/orchestrator.ts";
import { createDeployManager } from "./deploy/index.ts";
import { createChildLogger, logger } from "./lib/logger.ts";
import type { Storage } from "./storage/index.ts";

const log = createChildLogger("main");

async function main() {
  const config = loadConfig();

  // Ensure data directory exists for SQLite
  mkdirSync("data", { recursive: true });

  // Storage: SQLite with in-memory fallback
  let storage: Storage;
  try {
    storage = createSqliteStorage("data/tasks.sqlite");
    log.info("Using SQLite storage");
  } catch {
    storage = createMemoryStorage();
    log.info("Using in-memory storage (SQLite unavailable)");
  }

  // Git manager
  const gitManager = createGitManager(config.git);
  await gitManager.init();

  // Deploy manager
  const deployManager = createDeployManager(config.deploy);

  // Task queue
  const queue = createTaskQueue({ taskTimeout: config.agent.taskTimeout });

  // Bot
  const bot = createBot({ config, storage, queue });

  // Orchestrator: wires queue → agent → git → deploy
  const taskHandler = createTaskHandler({
    storage,
    gitManager,
    config,
    onProgress: async ({ chatId, message }) => {
      try {
        await bot.api.sendMessage(chatId, message);
      } catch (err) {
        log.warn({ chatId, err }, "Failed to send progress message");
      }
    },
  });
  queue.onTask(taskHandler);

  // Server with webhook routes
  const app = createApp({
    bot: config.telegram.botMode === "webhook" ? bot : undefined,
    webhook: {
      storage,
      webhookSecret: config.deploy.webhookSecret,
      onBuildEvent: async ({ chatId, status, url, error }) => {
        let message: string;
        if (status === "success") {
          message = `Deploy succeeded!${url ? `\n${url}` : ""}`;
        } else if (status === "failure") {
          message = `Deploy failed: ${error ?? "Unknown error"}`;
        } else if (status === "building") {
          message = "Deploy in progress...";
        } else {
          message = `Deploy status: ${status}`;
        }
        try {
          await bot.api.sendMessage(chatId, message);
        } catch (err) {
          log.warn({ chatId, err }, "Failed to send build event message");
        }
      },
    },
  });

  // Start queue processing
  queue.start();
  log.info("Task queue started");

  // Start HTTP server
  serve({ fetch: app.fetch, port: config.server.port }, (info) => {
    log.info(`Server running on http://localhost:${info.port}`);
  });

  // Start bot based on mode
  if (config.telegram.botMode === "webhook") {
    const webhookUrl =
      config.telegram.webhookUrl ||
      `http://localhost:${config.server.port}/webhook/telegram`;
    await registerWebhook({ bot, url: webhookUrl });
    log.info("Bot running in webhook mode");
  } else {
    await startPolling(bot);
    log.info("Bot running in polling mode");
  }

  // Graceful shutdown
  const shutdown = () => {
    log.info("Shutting down...");
    queue.stop();
    bot.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});
