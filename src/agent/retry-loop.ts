import { createChildLogger } from "../lib/logger.ts";
import { AgentError } from "../lib/errors.ts";
import type { AgentResult, ProgressCallback } from "../lib/types.ts";

const log = createChildLogger("agent:retry");

export interface RetryableAgentFn {
  (opts: {
    userMessage: string;
    errorContext?: string;
    attempt: number;
    onProgress: ProgressCallback;
  }): Promise<AgentResult>;
}

export async function runWithRetry(opts: {
  userMessage: string;
  maxRetries: number;
  agentFn: RetryableAgentFn;
  onProgress: ProgressCallback;
}): Promise<AgentResult> {
  const { userMessage, maxRetries, agentFn, onProgress } = opts;

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    log.info({ attempt, maxAttempts: maxRetries + 1 }, "Agent attempt");

    if (attempt > 1) {
      await onProgress(`Retry attempt ${attempt - 1}/${maxRetries}...`);
    }

    try {
      const result = await agentFn({
        userMessage,
        errorContext: lastError,
        attempt,
        onProgress,
      });

      if (result.success) {
        return result;
      }

      lastError = result.summary;
      log.warn({ attempt, error: lastError }, "Agent attempt failed");
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      log.error({ attempt, err }, "Agent attempt threw");
    }
  }

  return {
    success: false,
    summary: `Failed after ${maxRetries + 1} attempts. Last error: ${lastError ?? "unknown"}`,
    filesChanged: [],
    commitHash: null,
    screenshotPath: null,
  };
}
