import type { Task, TaskResult, ProgressCallback } from "../lib/types.ts";
import type { TaskHandler } from "./types.ts";
import type { Storage } from "../storage/index.ts";
import type { GitManager } from "../git/index.ts";
import type { AppConfig } from "../config/schema.ts";
import { runAgent } from "../agent/index.ts";
import { formatTaskResult, formatError } from "../bot/formatter.ts";
import { createChildLogger } from "../lib/logger.ts";

const log = createChildLogger("orchestrator");

export interface OrchestratorDeps {
  storage: Storage;
  gitManager: GitManager;
  config: AppConfig;
  onProgress: (opts: { chatId: number; message: string }) => Promise<void>;
}

export function createTaskHandler(deps: OrchestratorDeps): TaskHandler {
  const { storage, gitManager, config, onProgress } = deps;

  return async (opts: {
    task: Task;
    onProgress: ProgressCallback;
  }): Promise<TaskResult> => {
    const { task } = opts;

    const sendProgress = async (message: string) => {
      await onProgress({ chatId: task.telegramChatId, message });
      await opts.onProgress(message);
    };

    storage.updateTask(task.id, { status: "running" });

    try {
      await sendProgress("Pulling latest changes...");
      await gitManager.pull();

      await sendProgress("Preparing branch...");
      const branch = await gitManager.prepareBranch(task.id);
      log.info({ taskId: task.id, branch }, "Branch prepared");

      await sendProgress("Working on changes...");
      const agentResult = await runAgent({
        userMessage: task.userMessage,
        repoPath: config.git.localPath,
        git: gitManager.getGit(),
        config,
        onProgress: sendProgress,
      });

      if (!agentResult.success) {
        await sendProgress("Changes failed, cleaning up...");
        await gitManager.clean();

        const result: TaskResult = {
          taskId: task.id,
          success: false,
          summary: agentResult.summary,
          filesChanged: agentResult.filesChanged,
          commitHash: null,
          screenshotPath: null,
          error: agentResult.summary,
        };
        storage.saveTaskResult(result);
        storage.updateTask(task.id, { status: "failed" });
        await sendProgress(formatError(agentResult.summary));
        return result;
      }

      if (agentResult.commitHash) {
        await sendProgress("Pushing changes...");
        await gitManager.push(branch);
      }

      const result: TaskResult = {
        taskId: task.id,
        success: true,
        summary: agentResult.summary,
        filesChanged: agentResult.filesChanged,
        commitHash: agentResult.commitHash,
        screenshotPath: agentResult.screenshotPath,
        error: null,
      };

      storage.saveTaskResult(result);
      storage.updateTask(task.id, { status: "completed" });
      await sendProgress(formatTaskResult(result));
      log.info({ taskId: task.id }, "Task orchestration complete");
      return result;
    } catch (err) {
      log.error({ taskId: task.id, err }, "Orchestration failed");

      await sendProgress("Error occurred, cleaning up...");
      try {
        await gitManager.clean();
      } catch {
        log.warn({ taskId: task.id }, "Cleanup also failed");
      }

      const errorMsg = err instanceof Error ? err.message : String(err);
      const result: TaskResult = {
        taskId: task.id,
        success: false,
        summary: errorMsg,
        filesChanged: [],
        commitHash: null,
        screenshotPath: null,
        error: errorMsg,
      };

      storage.saveTaskResult(result);
      storage.updateTask(task.id, { status: "failed" });
      await sendProgress(formatError(errorMsg));
      return result;
    }
  };
}
