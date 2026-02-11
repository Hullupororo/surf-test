import { describe, it, expect, vi } from "vitest";
import { mapWebhookToTask } from "../../src/webhook/mapper.ts";
import type { Storage } from "../../src/storage/index.ts";
import type { ParsedWebhook } from "../../src/webhook/parser.ts";
import type { Task, TaskResult } from "../../src/lib/types.ts";

function makeStorage(opts?: {
  tasks?: Task[];
  results?: TaskResult[];
}): Storage {
  return {
    saveTask: vi.fn(),
    getTask: vi.fn((id: string) =>
      (opts?.tasks ?? []).find((t) => t.id === id) ?? null,
    ),
    updateTask: vi.fn(),
    listTasks: vi.fn(() => opts?.tasks ?? []),
    saveTaskResult: vi.fn(),
    getTaskResult: vi.fn(),
    listTaskResults: vi.fn(() => opts?.results ?? []),
  };
}

function makeWebhook(overrides?: Partial<ParsedWebhook>): ParsedWebhook {
  return {
    platform: "vercel",
    deployId: "dpl-1",
    status: "success",
    url: "https://app.vercel.app",
    error: null,
    commitHash: null,
    raw: {},
    ...overrides,
  };
}

describe("mapWebhookToTask", () => {
  it("maps by commit hash", () => {
    const task: Task = {
      id: "t-1",
      userMessage: "fix header",
      status: "completed",
      telegramChatId: 123,
      telegramMessageId: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const result: TaskResult = {
      taskId: "t-1",
      success: true,
      summary: "Done",
      filesChanged: [],
      commitHash: "abc123",
      screenshotPath: null,
      error: null,
    };

    const storage = makeStorage({ tasks: [task], results: [result] });
    const webhook = makeWebhook({ commitHash: "abc123" });

    const mapped = mapWebhookToTask({ webhook, storage });

    expect(mapped).toBeDefined();
    expect(mapped!.task.id).toBe("t-1");
    expect(mapped!.webhook).toBe(webhook);
  });

  it("falls back to most recent completed task", () => {
    const task: Task = {
      id: "t-2",
      userMessage: "add button",
      status: "completed",
      telegramChatId: 456,
      telegramMessageId: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const storage = makeStorage({ tasks: [task], results: [] });
    const webhook = makeWebhook();

    const mapped = mapWebhookToTask({ webhook, storage });

    expect(mapped).toBeDefined();
    expect(mapped!.task.id).toBe("t-2");
  });

  it("returns null when no task matches", () => {
    const storage = makeStorage({ tasks: [], results: [] });
    const webhook = makeWebhook();

    const mapped = mapWebhookToTask({ webhook, storage });

    expect(mapped).toBeNull();
  });

  it("prefers commit hash match over recent task", () => {
    const task1: Task = {
      id: "t-1",
      userMessage: "old task",
      status: "completed",
      telegramChatId: 100,
      telegramMessageId: 1,
      createdAt: Date.now() - 10000,
      updatedAt: Date.now() - 10000,
    };
    const task2: Task = {
      id: "t-2",
      userMessage: "new task",
      status: "completed",
      telegramChatId: 200,
      telegramMessageId: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const result: TaskResult = {
      taskId: "t-1",
      success: true,
      summary: "Done",
      filesChanged: [],
      commitHash: "match-me",
      screenshotPath: null,
      error: null,
    };

    const storage = makeStorage({
      tasks: [task2, task1],
      results: [result],
    });
    const webhook = makeWebhook({ commitHash: "match-me" });

    const mapped = mapWebhookToTask({ webhook, storage });

    expect(mapped!.task.id).toBe("t-1");
  });
});
