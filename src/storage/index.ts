import type { Task, TaskResult } from "../lib/types.ts";

export interface Storage {
  saveTask(task: Task): void;
  getTask(id: string): Task | null;
  updateTask(id: string, updates: Partial<Task>): void;
  listTasks(opts: { limit: number; offset?: number }): Task[];

  saveTaskResult(result: TaskResult): void;
  getTaskResult(taskId: string): TaskResult | null;
  listTaskResults(opts: { limit: number; offset?: number }): TaskResult[];
}
