export type TaskStatus = "queued" | "running" | "completed" | "failed";

export interface Task {
  id: string;
  userMessage: string;
  status: TaskStatus;
  telegramChatId: number;
  telegramMessageId: number;
  createdAt: number;
  updatedAt: number;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  summary: string;
  filesChanged: string[];
  commitHash: string | null;
  screenshotPath: string | null;
  error: string | null;
}

export interface AgentResult {
  success: boolean;
  summary: string;
  filesChanged: string[];
  commitHash: string | null;
  screenshotPath: string | null;
}

export interface ProgressCallback {
  (message: string): Promise<void>;
}
