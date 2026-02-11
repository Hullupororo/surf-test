import Database from "better-sqlite3";
import type { Task, TaskResult } from "../lib/types.ts";
import type { Storage } from "./index.ts";
import { createChildLogger } from "../lib/logger.ts";

const log = createChildLogger("storage:sqlite");

export function createSqliteStorage(dbPath: string): Storage {
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      telegram_chat_id INTEGER NOT NULL,
      telegram_message_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_results (
      task_id TEXT PRIMARY KEY REFERENCES tasks(id),
      success INTEGER NOT NULL,
      summary TEXT NOT NULL,
      files_changed TEXT NOT NULL DEFAULT '[]',
      commit_hash TEXT,
      screenshot_path TEXT,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);
  `);

  log.info({ dbPath }, "SQLite storage initialized");

  const insertTask = db.prepare(`
    INSERT INTO tasks (id, user_message, status, telegram_chat_id, telegram_message_id, created_at, updated_at)
    VALUES (@id, @userMessage, @status, @telegramChatId, @telegramMessageId, @createdAt, @updatedAt)
  `);

  const selectTask = db.prepare(`SELECT * FROM tasks WHERE id = ?`);

  const updateTaskStmt = db.prepare(`
    UPDATE tasks SET status = @status, updated_at = @updatedAt WHERE id = @id
  `);

  const selectTasks = db.prepare(`
    SELECT * FROM tasks ORDER BY created_at DESC LIMIT ? OFFSET ?
  `);

  const insertResult = db.prepare(`
    INSERT OR REPLACE INTO task_results (task_id, success, summary, files_changed, commit_hash, screenshot_path, error)
    VALUES (@taskId, @success, @summary, @filesChanged, @commitHash, @screenshotPath, @error)
  `);

  const selectResult = db.prepare(
    `SELECT * FROM task_results WHERE task_id = ?`,
  );

  const selectResults = db.prepare(`
    SELECT * FROM task_results LIMIT ? OFFSET ?
  `);

  function rowToTask(row: Record<string, unknown>): Task {
    return {
      id: row["id"] as string,
      userMessage: row["user_message"] as string,
      status: row["status"] as Task["status"],
      telegramChatId: row["telegram_chat_id"] as number,
      telegramMessageId: row["telegram_message_id"] as number,
      createdAt: row["created_at"] as number,
      updatedAt: row["updated_at"] as number,
    };
  }

  function rowToResult(row: Record<string, unknown>): TaskResult {
    return {
      taskId: row["task_id"] as string,
      success: (row["success"] as number) === 1,
      summary: row["summary"] as string,
      filesChanged: JSON.parse(row["files_changed"] as string) as string[],
      commitHash: (row["commit_hash"] as string) ?? null,
      screenshotPath: (row["screenshot_path"] as string) ?? null,
      error: (row["error"] as string) ?? null,
    };
  }

  return {
    saveTask(task: Task): void {
      insertTask.run({
        id: task.id,
        userMessage: task.userMessage,
        status: task.status,
        telegramChatId: task.telegramChatId,
        telegramMessageId: task.telegramMessageId,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      });
    },

    getTask(id: string): Task | null {
      const row = selectTask.get(id) as Record<string, unknown> | undefined;
      return row ? rowToTask(row) : null;
    },

    updateTask(id: string, updates: Partial<Task>): void {
      const current = selectTask.get(id) as Record<string, unknown> | undefined;
      if (!current) return;

      updateTaskStmt.run({
        id,
        status: updates.status ?? current["status"],
        updatedAt: Date.now(),
      });
    },

    listTasks({ limit, offset = 0 }): Task[] {
      const rows = selectTasks.all(limit, offset) as Record<string, unknown>[];
      return rows.map(rowToTask);
    },

    saveTaskResult(result: TaskResult): void {
      insertResult.run({
        taskId: result.taskId,
        success: result.success ? 1 : 0,
        summary: result.summary,
        filesChanged: JSON.stringify(result.filesChanged),
        commitHash: result.commitHash,
        screenshotPath: result.screenshotPath,
        error: result.error,
      });
    },

    getTaskResult(taskId: string): TaskResult | null {
      const row = selectResult.get(taskId) as
        | Record<string, unknown>
        | undefined;
      return row ? rowToResult(row) : null;
    },

    listTaskResults({ limit, offset = 0 }): TaskResult[] {
      const rows = selectResults.all(limit, offset) as Record<
        string,
        unknown
      >[];
      return rows.map(rowToResult);
    },
  };
}
