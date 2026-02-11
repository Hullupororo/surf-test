import type { DeployManager } from "../../deploy/index.ts";
import { createChildLogger } from "../../lib/logger.ts";

const log = createChildLogger("skill:deploy");

export interface DeployTriggerResult {
  triggered: boolean;
  deployId: string | null;
  platform: string;
  error: string | null;
}

export async function triggerDeploy(opts: {
  deployManager: DeployManager;
}): Promise<DeployTriggerResult> {
  const { deployManager } = opts;
  const platform = deployManager.getPlatform();

  try {
    log.info({ platform }, "Triggering deployment");
    const result = await deployManager.trigger();

    return {
      triggered: true,
      deployId: result.deployId,
      platform: result.platform,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ platform, err: message }, "Deploy trigger failed");

    return {
      triggered: false,
      deployId: null,
      platform,
      error: message,
    };
  }
}
