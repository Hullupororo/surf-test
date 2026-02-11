import { describe, it, expect } from "vitest";
import { createTask, transitionTask, isTerminal } from "../../src/queue/task.ts";

describe("createTask", () => {
  it("creates a task with queued status", () => {
    const task = createTask({
      id: "t-1",
      userMessage: "Fix the header",
      telegramChatId: 123,
      telegramMessageId: 456,
    });

    expect(task.id).toBe("t-1");
    expect(task.userMessage).toBe("Fix the header");
    expect(task.status).toBe("queued");
    expect(task.telegramChatId).toBe(123);
    expect(task.telegramMessageId).toBe(456);
    expect(task.createdAt).toBeGreaterThan(0);
    expect(task.updatedAt).toBe(task.createdAt);
  });
});

describe("transitionTask", () => {
  it("queued → running", () => {
    const task = createTask({
      id: "t-1",
      userMessage: "test",
      telegramChatId: 1,
      telegramMessageId: 1,
    });
    const next = transitionTask(task, "running");
    expect(next.status).toBe("running");
    expect(next.updatedAt).toBeGreaterThanOrEqual(task.updatedAt);
  });

  it("running → completed", () => {
    const task = createTask({
      id: "t-1",
      userMessage: "test",
      telegramChatId: 1,
      telegramMessageId: 1,
    });
    const running = transitionTask(task, "running");
    const completed = transitionTask(running, "completed");
    expect(completed.status).toBe("completed");
  });

  it("running → failed", () => {
    const task = createTask({
      id: "t-1",
      userMessage: "test",
      telegramChatId: 1,
      telegramMessageId: 1,
    });
    const running = transitionTask(task, "running");
    const failed = transitionTask(running, "failed");
    expect(failed.status).toBe("failed");
  });

  it("queued → failed (cancellation)", () => {
    const task = createTask({
      id: "t-1",
      userMessage: "test",
      telegramChatId: 1,
      telegramMessageId: 1,
    });
    const failed = transitionTask(task, "failed");
    expect(failed.status).toBe("failed");
  });

  it("throws on invalid transition: queued → completed", () => {
    const task = createTask({
      id: "t-1",
      userMessage: "test",
      telegramChatId: 1,
      telegramMessageId: 1,
    });
    expect(() => transitionTask(task, "completed")).toThrow(
      "Invalid transition",
    );
  });

  it("throws on invalid transition: completed → running", () => {
    const task = createTask({
      id: "t-1",
      userMessage: "test",
      telegramChatId: 1,
      telegramMessageId: 1,
    });
    const running = transitionTask(task, "running");
    const completed = transitionTask(running, "completed");
    expect(() => transitionTask(completed, "running")).toThrow(
      "Invalid transition",
    );
  });

  it("does not mutate original task", () => {
    const task = createTask({
      id: "t-1",
      userMessage: "test",
      telegramChatId: 1,
      telegramMessageId: 1,
    });
    transitionTask(task, "running");
    expect(task.status).toBe("queued");
  });
});

describe("isTerminal", () => {
  it("completed is terminal", () => {
    expect(isTerminal("completed")).toBe(true);
  });

  it("failed is terminal", () => {
    expect(isTerminal("failed")).toBe(true);
  });

  it("queued is not terminal", () => {
    expect(isTerminal("queued")).toBe(false);
  });

  it("running is not terminal", () => {
    expect(isTerminal("running")).toBe(false);
  });
});
