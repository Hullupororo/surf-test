import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSqliteStorage } from "../../src/storage/sqlite.ts";
import type { Storage } from "../../src/storage/index.ts";
import type { Task, TaskResult } from "../../src/lib/types.ts";

describe("SQLite Storage", () => {
  let storage: Storage;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "sqlite-test-"));
    storage = createSqliteStorage(join(tmpDir, "test.sqlite"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeTask(id: string): Task {
    return {
      id,
      userMessage: `Task ${id}`,
      status: "queued",
      telegramChatId: 123,
      telegramMessageId: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  function makeResult(taskId: string): TaskResult {
    return {
      taskId,
      success: true,
      summary: "Done",
      filesChanged: ["index.html", "style.css"],
      commitHash: "abc123",
      screenshotPath: null,
      error: null,
    };
  }

  it("saves and retrieves a task", () => {
    const task = makeTask("t-1");
    storage.saveTask(task);

    const retrieved = storage.getTask("t-1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe("t-1");
    expect(retrieved!.userMessage).toBe("Task t-1");
    expect(retrieved!.status).toBe("queued");
  });

  it("returns null for unknown task", () => {
    expect(storage.getTask("nonexistent")).toBeNull();
  });

  it("updates task status", () => {
    storage.saveTask(makeTask("t-1"));
    storage.updateTask("t-1", { status: "running" });

    const task = storage.getTask("t-1");
    expect(task!.status).toBe("running");
    expect(task!.updatedAt).toBeGreaterThan(0);
  });

  it("lists tasks ordered by creation time", () => {
    const t1 = makeTask("t-1");
    t1.createdAt = 1000;
    const t2 = makeTask("t-2");
    t2.createdAt = 2000;
    const t3 = makeTask("t-3");
    t3.createdAt = 3000;

    storage.saveTask(t1);
    storage.saveTask(t2);
    storage.saveTask(t3);

    const tasks = storage.listTasks({ limit: 10 });
    expect(tasks).toHaveLength(3);
    expect(tasks[0]!.id).toBe("t-3"); // most recent first
    expect(tasks[2]!.id).toBe("t-1");
  });

  it("lists tasks with limit and offset", () => {
    for (let i = 1; i <= 5; i++) {
      const task = makeTask(`t-${i}`);
      task.createdAt = i * 1000;
      storage.saveTask(task);
    }

    const page = storage.listTasks({ limit: 2, offset: 1 });
    expect(page).toHaveLength(2);
    expect(page[0]!.id).toBe("t-4");
    expect(page[1]!.id).toBe("t-3");
  });

  it("saves and retrieves a task result", () => {
    storage.saveTask(makeTask("t-1"));
    storage.saveTaskResult(makeResult("t-1"));

    const result = storage.getTaskResult("t-1");
    expect(result).toBeDefined();
    expect(result!.success).toBe(true);
    expect(result!.summary).toBe("Done");
    expect(result!.filesChanged).toEqual(["index.html", "style.css"]);
    expect(result!.commitHash).toBe("abc123");
  });

  it("returns null for unknown result", () => {
    expect(storage.getTaskResult("nonexistent")).toBeNull();
  });

  it("saves failed result with error", () => {
    storage.saveTask(makeTask("t-1"));
    storage.saveTaskResult({
      taskId: "t-1",
      success: false,
      summary: "Failed",
      filesChanged: [],
      commitHash: null,
      screenshotPath: null,
      error: "Something went wrong",
    });

    const result = storage.getTaskResult("t-1");
    expect(result!.success).toBe(false);
    expect(result!.error).toBe("Something went wrong");
  });

  it("lists task results", () => {
    storage.saveTask(makeTask("t-1"));
    storage.saveTask(makeTask("t-2"));
    storage.saveTaskResult(makeResult("t-1"));
    storage.saveTaskResult(makeResult("t-2"));

    const results = storage.listTaskResults({ limit: 10 });
    expect(results).toHaveLength(2);
  });

  it("upserts task result on duplicate", () => {
    storage.saveTask(makeTask("t-1"));
    storage.saveTaskResult(makeResult("t-1"));

    // Save again with different data
    storage.saveTaskResult({
      ...makeResult("t-1"),
      summary: "Updated",
    });

    const result = storage.getTaskResult("t-1");
    expect(result!.summary).toBe("Updated");
  });
});
