import { serve } from "@hono/node-server";
import { createApp } from "./server.ts";
import { createBot } from "./bot/index.ts";
import { loadConfig } from "./config/index.ts";
import { createMemoryStorage } from "./storage/memory.ts";
import { createChildLogger, logger } from "./lib/logger.ts";

const log = createChildLogger("main");

try {
  const config = loadConfig();
  const storage = createMemoryStorage();
  const bot = createBot({ config, storage, queue: null });
  const app = createApp({ bot });

  serve({ fetch: app.fetch, port: config.server.port }, (info) => {
    log.info(`Server running on http://localhost:${info.port}`);
  });
} catch (err) {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
}
