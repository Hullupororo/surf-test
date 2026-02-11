import { configSchema } from "./schema.ts";
import type { AppConfig } from "./schema.ts";

export type { AppConfig };

export function loadConfig(): AppConfig {
  const raw = {
    telegram: {
      botToken: process.env["TELEGRAM_BOT_TOKEN"] ?? "",
      allowedUsers: parseNumberList(process.env["TELEGRAM_ALLOWED_USERS"]),
    },
    anthropic: {
      apiKey: process.env["ANTHROPIC_API_KEY"] ?? "",
    },
    git: {
      repoUrl: process.env["REPO_URL"] ?? "",
      localPath: process.env["REPO_LOCAL_PATH"] ?? "./repos/default",
      branchStrategy: process.env["REPO_BRANCH_STRATEGY"] ?? "direct",
    },
    deploy: {
      platform: process.env["DEPLOY_PLATFORM"] ?? "vercel",
      hookUrl: process.env["DEPLOY_HOOK_URL"] ?? "",
      webhookSecret: process.env["DEPLOY_WEBHOOK_SECRET"] ?? "",
    },
    playwright: {
      headless: process.env["PLAYWRIGHT_MCP_HEADLESS"] !== "false",
      viewport: process.env["PLAYWRIGHT_MCP_VIEWPORT"] ?? "1280x720",
    },
    agent: {
      maxRetries: parseIntOrDefault(process.env["AGENT_MAX_RETRIES"], 3),
      taskTimeout: parseIntOrDefault(process.env["AGENT_TASK_TIMEOUT"], 300_000),
      devServerCmd: process.env["AGENT_DEV_SERVER_CMD"] ?? "npm run dev",
      devServerPort: parseIntOrDefault(process.env["AGENT_DEV_SERVER_PORT"], 3000),
    },
    server: {
      port: parseIntOrDefault(process.env["PORT"], 4000),
    },
  };

  return configSchema.parse(raw);
}

function parseNumberList(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

function parseIntOrDefault(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
