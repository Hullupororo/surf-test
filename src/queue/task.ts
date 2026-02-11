import type { Task, TaskStatus } from "../lib/types.ts";
import { TaskError } from "../lib/errors.ts";

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ["running", "failed"],
  running: ["completed", "failed"],
  completed: [],
  failed: [],
};

export function createTask(opts: {
  id: string;
  userMessage: string;
  telegramChatId: number;
  telegramMessageId: number;
}): Task {
  const now = Date.now();
  return {
    id: opts.id,
    userMessage: opts.userMessage,
    status: "queued",
    telegramChatId: opts.telegramChatId,
    telegramMessageId: opts.telegramMessageId,
    createdAt: now,
    updatedAt: now,
  };
}

export function transitionTask(task: Task, newStatus: TaskStatus): Task {
  const allowed = VALID_TRANSITIONS[task.status];
  if (!allowed.includes(newStatus)) {
    throw new TaskError(
      `Invalid transition: ${task.status} → ${newStatus} for task ${task.id}`,
    );
  }
  return {
    ...task,
    status: newStatus,
    updatedAt: Date.now(),
  };
}

export function isTerminal(status: TaskStatus): boolean {
  return status === "completed" || status === "failed";
}
