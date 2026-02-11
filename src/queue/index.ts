import type { Task, TaskResult, ProgressCallback } from "../lib/types.ts";
import type { TaskQueue, TaskHandler } from "./types.ts";
import { transitionTask, isTerminal } from "./task.ts";
import { createChildLogger } from "../lib/logger.ts";

const log = createChildLogger("queue");

export function createTaskQueue(opts: { taskTimeout: number }): TaskQueue & {
  getTask(id: string): Task | null;
  getResult(id: string): TaskResult | null;
  size(): number;
} {
  const { taskTimeout } = opts;
  const queue: Task[] = [];
  const tasks = new Map<string, Task>();
  const results = new Map<string, TaskResult>();
  let handler: TaskHandler | null = null;
  let running = false;
  let processing = false;
  let currentAbort: AbortController | null = null;

  function updateTask(task: Task): void {
    tasks.set(task.id, task);
  }

  async function processNext(): Promise<void> {
    if (processing || !running || !handler) return;

    const task = queue.shift();
    if (!task) return;

    processing = true;
    currentAbort = new AbortController();

    let current = transitionTask(task, "running");
    updateTask(current);
    log.info({ taskId: current.id }, "Processing task");

    try {
      const result = await Promise.race([
        handler({
          task: current,
          onProgress: async (msg: string) => {
            log.info({ taskId: current.id, progress: msg }, "Task progress");
          },
        }),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Task timed out")),
            taskTimeout,
          );
          currentAbort!.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new Error("Task cancelled"));
          });
        }),
      ]);

      current = transitionTask(current, "completed");
      updateTask(current);
      results.set(current.id, result);
      log.info({ taskId: current.id }, "Task completed");
    } catch (err) {
      current = transitionTask(current, "failed");
      updateTask(current);

      const errorMsg = err instanceof Error ? err.message : String(err);
      results.set(current.id, {
        taskId: current.id,
        success: false,
        summary: errorMsg,
        filesChanged: [],
        commitHash: null,
        screenshotPath: null,
        error: errorMsg,
      });
      log.error({ taskId: current.id, err: errorMsg }, "Task failed");
    } finally {
      processing = false;
      currentAbort = null;
      // Process next task in queue
      void processNext();
    }
  }

  return {
    enqueue(task: Task): void {
      tasks.set(task.id, task);
      queue.push(task);
      log.info({ taskId: task.id, queueLength: queue.length }, "Task enqueued");
      if (running) {
        void processNext();
      }
    },

    cancel(taskId: string): boolean {
      // Try to remove from pending queue
      const idx = queue.findIndex((t) => t.id === taskId);
      if (idx !== -1) {
        const task = queue.splice(idx, 1)[0]!;
        const failed = transitionTask(task, "failed");
        updateTask(failed);
        results.set(taskId, {
          taskId,
          success: false,
          summary: "Task cancelled",
          filesChanged: [],
          commitHash: null,
          screenshotPath: null,
          error: "Task cancelled",
        });
        log.info({ taskId }, "Cancelled queued task");
        return true;
      }

      // Try to abort currently running task
      const current = tasks.get(taskId);
      if (current && current.status === "running" && currentAbort) {
        currentAbort.abort();
        log.info({ taskId }, "Cancelling running task");
        return true;
      }

      return false;
    },

    getStatus(taskId: string): Task | null {
      return tasks.get(taskId) ?? null;
    },

    onTask(h: TaskHandler): void {
      handler = h;
    },

    start(): void {
      running = true;
      log.info("Queue started");
      void processNext();
    },

    stop(): void {
      running = false;
      if (currentAbort) {
        currentAbort.abort();
      }
      log.info("Queue stopped");
    },

    getTask(id: string): Task | null {
      return tasks.get(id) ?? null;
    },

    getResult(id: string): TaskResult | null {
      return results.get(id) ?? null;
    },

    size(): number {
      return queue.length;
    },
  };
}
