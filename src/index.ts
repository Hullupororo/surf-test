import { serve } from "@hono/node-server";
import { createApp } from "./server.ts";
import { createBot } from "./bot/index.ts";
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

  // Storage: SQLite if path configured, otherwise in-memory
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
    bot,
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
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});
