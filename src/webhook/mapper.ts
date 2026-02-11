import type { Storage } from "../storage/index.ts";
import type { Task } from "../lib/types.ts";
import type { ParsedWebhook } from "./parser.ts";
import { createChildLogger } from "../lib/logger.ts";

const log = createChildLogger("webhook:mapper");

export interface MappedEvent {
  task: Task;
  webhook: ParsedWebhook;
}

export function mapWebhookToTask(opts: {
  webhook: ParsedWebhook;
  storage: Storage;
}): MappedEvent | null {
  const { webhook, storage } = opts;

  // Strategy 1: Match by commit hash in task results
  if (webhook.commitHash) {
    const results = storage.listTaskResults({ limit: 50 });
    for (const result of results) {
      if (result.commitHash === webhook.commitHash) {
        const task = storage.getTask(result.taskId);
        if (task) {
          log.info(
            { taskId: task.id, commitHash: webhook.commitHash },
            "Mapped webhook to task via commit hash",
          );
          return { task, webhook };
        }
      }
    }
  }

  // Strategy 2: Match most recent completed task
  const tasks = storage.listTasks({ limit: 10 });
  const recentCompleted = tasks.find(
    (t) => t.status === "completed" || t.status === "running",
  );

  if (recentCompleted) {
    log.info(
      { taskId: recentCompleted.id },
      "Mapped webhook to most recent task",
    );
    return { task: recentCompleted, webhook };
  }

  log.warn({ deployId: webhook.deployId }, "Could not map webhook to any task");
  return null;
}
