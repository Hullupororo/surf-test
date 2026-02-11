import type { Task, TaskResult } from "../lib/types.ts";
import type { Storage } from "./index.ts";

export function createMemoryStorage(): Storage {
  const tasks = new Map<string, Task>();
  const results = new Map<string, TaskResult>();

  return {
    saveTask(task) {
      tasks.set(task.id, { ...task });
    },

    getTask(id) {
      const task = tasks.get(id);
      return task ? { ...task } : null;
    },

    updateTask(id, updates) {
      const task = tasks.get(id);
      if (!task) return;
      tasks.set(id, { ...task, ...updates, updatedAt: Date.now() });
    },

    listTasks({ limit, offset = 0 }) {
      const all = [...tasks.values()].sort((a, b) => b.createdAt - a.createdAt);
      return all.slice(offset, offset + limit);
    },

    saveTaskResult(result) {
      results.set(result.taskId, { ...result });
    },

    getTaskResult(taskId) {
      const result = results.get(taskId);
      return result ? { ...result } : null;
    },

    listTaskResults({ limit, offset = 0 }) {
      const all = [...results.values()];
      return all.slice(offset, offset + limit);
    },
  };
}
