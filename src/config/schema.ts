import { z } from "zod";

const telegramSchema = z.object({
  botToken: z.string().min(1),
  allowedUsers: z.array(z.number()),
});

const anthropicSchema = z.object({
  apiKey: z.string().min(1),
});

const gitSchema = z.object({
  repoUrl: z.string().min(1),
  localPath: z.string().default("./repos/default"),
  branchStrategy: z.enum(["direct", "feature-branch"]).default("direct"),
});

const deploySchema = z.object({
  platform: z.enum(["vercel", "netlify", "custom"]).default("vercel"),
  hookUrl: z.string().default(""),
  webhookSecret: z.string().default(""),
});

const playwrightSchema = z.object({
  headless: z.boolean().default(true),
  viewport: z.string().default("1280x720"),
});

const agentSchema = z.object({
  maxRetries: z.number().default(3),
  taskTimeout: z.number().default(300_000),
  devServerCmd: z.string().default("npm run dev"),
  devServerPort: z.number().default(3000),
});

const serverSchema = z.object({
  port: z.number().default(4000),
});

export const configSchema = z.object({
  telegram: telegramSchema,
  anthropic: anthropicSchema,
  git: gitSchema,
  deploy: deploySchema,
  playwright: playwrightSchema,
  agent: agentSchema,
  server: serverSchema,
});

export type AppConfig = z.infer<typeof configSchema>;
