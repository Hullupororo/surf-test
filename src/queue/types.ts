import type { Task, TaskResult, ProgressCallback } from "../lib/types.ts";

export interface TaskHandler {
  (opts: { task: Task; onProgress: ProgressCallback }): Promise<TaskResult>;
}

export interface TaskQueue {
  enqueue(task: Task): void;
  cancel(taskId: string): boolean;
  getStatus(taskId: string): Task | null;
  onTask(handler: TaskHandler): void;
  start(): void;
  stop(): void;
}
