import { createChildLogger } from "../../lib/logger.ts";
import { DeployError } from "../../lib/errors.ts";
import type { DeployAdapter, TriggerResult } from "../index.ts";

const log = createChildLogger("deploy:vercel");

export function createVercelAdapter(hookUrl: string): DeployAdapter {
  return {
    platform: "vercel",

    async trigger(): Promise<TriggerResult> {
      if (!hookUrl) {
        throw new DeployError("Vercel deploy hook URL is not configured");
      }

      log.info({ hookUrl }, "Triggering Vercel deploy");

      const response = await fetch(hookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new DeployError(
          `Vercel deploy hook returned ${response.status}: ${await response.text()}`,
        );
      }

      const body = (await response.json()) as { job?: { id?: string } };
      const deployId = body.job?.id ?? "unknown";

      log.info({ deployId }, "Vercel deploy triggered");

      return {
        deployId,
        platform: "vercel",
      };
    },
  };
}
