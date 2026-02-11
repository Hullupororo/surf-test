import { serve } from "@hono/node-server";
import { createApp } from "./server.ts";
import { loadConfig } from "./config/index.ts";
import { createChildLogger, logger } from "./lib/logger.ts";

const log = createChildLogger("main");

try {
  const config = loadConfig();
  const app = createApp();

  serve({ fetch: app.fetch, port: config.server.port }, (info) => {
    log.info(`Server running on http://localhost:${info.port}`);
  });
} catch (err) {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
}
