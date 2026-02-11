import type { GitManager } from "../../git/index.ts";
import { createChildLogger } from "../../lib/logger.ts";

const log = createChildLogger("skill:git-ops");

export interface GitOpsResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export async function commitAndPush(opts: {
  gitManager: GitManager;
  message: string;
  branch?: string;
}): Promise<GitOpsResult> {
  const { gitManager, message, branch } = opts;

  try {
    const hash = await gitManager.commitAll(message);
    log.info({ hash, message }, "Committed changes");

    if (branch) {
      await gitManager.push(branch);
      log.info({ branch }, "Pushed to remote");
    }

    return {
      success: true,
      message: `Committed: ${hash}${branch ? ` and pushed to ${branch}` : ""}`,
      data: { hash, branch },
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error({ err: errMsg }, "Commit/push failed");
    return { success: false, message: errMsg };
  }
}

export async function rollbackChanges(opts: {
  gitManager: GitManager;
}): Promise<GitOpsResult> {
  const { gitManager } = opts;

  try {
    const revertHash = await gitManager.rollback();
    log.info({ revertHash }, "Rolled back last commit");
    return {
      success: true,
      message: `Rolled back. Revert commit: ${revertHash}`,
      data: { revertHash },
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error({ err: errMsg }, "Rollback failed");
    return { success: false, message: errMsg };
  }
}

export async function cleanWorkingDirectory(opts: {
  gitManager: GitManager;
}): Promise<GitOpsResult> {
  const { gitManager } = opts;

  try {
    await gitManager.clean();
    log.info("Cleaned working directory");
    return { success: true, message: "Working directory cleaned" };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error({ err: errMsg }, "Clean failed");
    return { success: false, message: errMsg };
  }
}
