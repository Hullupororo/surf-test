import { createChildLogger } from "../../lib/logger.ts";
import { DeployError } from "../../lib/errors.ts";
import type { DeployAdapter, TriggerResult } from "../index.ts";

const log = createChildLogger("deploy:custom");

export function createCustomAdapter(hookUrl: string): DeployAdapter {
  return {
    platform: "custom",

    async trigger(): Promise<TriggerResult> {
      if (!hookUrl) {
        throw new DeployError("Custom deploy hook URL is not configured");
      }

      log.info({ hookUrl }, "Triggering custom deploy");

      const response = await fetch(hookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new DeployError(
          `Custom deploy hook returned ${response.status}: ${await response.text()}`,
        );
      }

      log.info("Custom deploy triggered");

      return {
        deployId: "custom-deploy",
        platform: "custom",
      };
    },
  };
}
