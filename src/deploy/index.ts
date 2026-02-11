import type { AppConfig } from "../config/schema.ts";
import { createVercelAdapter } from "./adapters/vercel.ts";
import { createNetlifyAdapter } from "./adapters/netlify.ts";
import { createCustomAdapter } from "./adapters/custom.ts";
import { createChildLogger } from "../lib/logger.ts";
import { DeployError } from "../lib/errors.ts";

const log = createChildLogger("deploy");

export interface TriggerResult {
  deployId: string;
  platform: string;
}

export interface DeployAdapter {
  platform: string;
  trigger(): Promise<TriggerResult>;
}

export interface DeployManager {
  trigger(): Promise<TriggerResult>;
  getPlatform(): string;
}

export function createDeployManager(
  config: AppConfig["deploy"],
): DeployManager {
  const adapter = createAdapter(config);

  return {
    async trigger(): Promise<TriggerResult> {
      log.info({ platform: adapter.platform }, "Triggering deployment");
      const result = await adapter.trigger();
      log.info(
        { deployId: result.deployId, platform: result.platform },
        "Deployment triggered",
      );
      return result;
    },

    getPlatform(): string {
      return adapter.platform;
    },
  };
}

function createAdapter(config: AppConfig["deploy"]): DeployAdapter {
  switch (config.platform) {
    case "vercel":
      return createVercelAdapter(config.hookUrl);
    case "netlify":
      return createNetlifyAdapter(config.hookUrl);
    case "custom":
      return createCustomAdapter(config.hookUrl);
    default:
      throw new DeployError(`Unsupported deploy platform: ${config.platform}`);
  }
}
