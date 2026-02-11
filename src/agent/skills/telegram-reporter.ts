import type { ProgressCallback } from "../../lib/types.ts";
import { createChildLogger } from "../../lib/logger.ts";

const log = createChildLogger("skill:reporter");

export interface TelegramReporter {
  sendProgress(message: string): Promise<void>;
  sendResult(opts: {
    success: boolean;
    summary: string;
    filesChanged: string[];
    commitHash: string | null;
  }): Promise<void>;
  sendError(error: string): Promise<void>;
}

export function createTelegramReporter(
  onProgress: ProgressCallback,
): TelegramReporter {
  return {
    async sendProgress(message: string) {
      log.info({ message }, "Sending progress update");
      await onProgress(message);
    },

    async sendResult(opts) {
      const { success, summary, filesChanged, commitHash } = opts;
      const parts: string[] = [];

      parts.push(
        success ? "Changes completed successfully!" : "Changes failed.",
      );
      parts.push("");
      parts.push(summary);

      if (filesChanged.length > 0) {
        parts.push("");
        parts.push(`Files changed (${filesChanged.length}):`);
        for (const file of filesChanged.slice(0, 10)) {
          parts.push(`  - ${file}`);
        }
        if (filesChanged.length > 10) {
          parts.push(`  ... and ${filesChanged.length - 10} more`);
        }
      }

      if (commitHash) {
        parts.push("");
        parts.push(`Commit: ${commitHash}`);
      }

      const message = parts.join("\n");
      log.info({ success, filesCount: filesChanged.length }, "Sending result");
      await onProgress(message);
    },

    async sendError(error: string) {
      const message = `Error: ${error}`;
      log.error({ error }, "Sending error");
      await onProgress(message);
    },
  };
}
