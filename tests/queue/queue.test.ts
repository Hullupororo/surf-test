import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTaskQueue } from "../../src/queue/index.ts";
import { createTask } from "../../src/queue/task.ts";
import type { TaskResult } from "../../src/lib/types.ts";

function makeTask(id: string) {
  return createTask({
    id,
    userMessage: `Task ${id}`,
    telegramChatId: 1,
    telegramMessageId: 1,
  });
}

function makeResult(taskId: string): TaskResult {
  return {
    taskId,
    success: true,
    summary: "Done",
    filesChanged: [],
    commitHash: null,
    screenshotPath: null,
    error: null,
  };
}

describe("createTaskQueue", () => {
  let queue: ReturnType<typeof createTaskQueue>;

  beforeEach(() => {
    queue = createTaskQueue({ taskTimeout: 5000 });
  });

  it("enqueues a task and tracks it via getStatus", () => {
    const task = makeTask("t-1");
    queue.enqueue(task);
    const status = queue.getStatus("t-1");
    expect(status).toBeDefined();
    expect(status!.id).toBe("t-1");
    expect(status!.status).toBe("queued");
  });

  it("returns null for unknown task", () => {
    expect(queue.getStatus("unknown")).toBeNull();
  });

  it("reports queue size", () => {
    expect(queue.size()).toBe(0);
    queue.enqueue(makeTask("t-1"));
    expect(queue.size()).toBe(1);
    queue.enqueue(makeTask("t-2"));
    expect(queue.size()).toBe(2);
  });

  it("processes tasks sequentially when started", async () => {
    const order: string[] = [];

    queue.onTask(async ({ task }) => {
      order.push(task.id);
      await new Promise((r) => setTimeout(r, 10));
      return makeResult(task.id);
    });

    queue.enqueue(makeTask("t-1"));
    queue.enqueue(makeTask("t-2"));
    queue.start();

    // Wait for both to process
    await new Promise((r) => setTimeout(r, 100));

    expect(order).toEqual(["t-1", "t-2"]);
    expect(queue.getStatus("t-1")!.status).toBe("completed");
    expect(queue.getStatus("t-2")!.status).toBe("completed");
  });

  it("stores results after completion", async () => {
    queue.onTask(async ({ task }) => makeResult(task.id));
    queue.enqueue(makeTask("t-1"));
    queue.start();

    await new Promise((r) => setTimeout(r, 50));

    const result = queue.getResult("t-1");
    expect(result).toBeDefined();
    expect(result!.success).toBe(true);
  });

  it("marks task as failed when handler throws", async () => {
    queue.onTask(async () => {
      throw new Error("boom");
    });

    queue.enqueue(makeTask("t-1"));
    queue.start();

    await new Promise((r) => setTimeout(r, 50));

    expect(queue.getStatus("t-1")!.status).toBe("failed");
    const result = queue.getResult("t-1");
    expect(result!.success).toBe(false);
    expect(result!.error).toBe("boom");
  });

  it("cancels a queued task", () => {
    queue.enqueue(makeTask("t-1"));
    const cancelled = queue.cancel("t-1");
    expect(cancelled).toBe(true);
    expect(queue.getStatus("t-1")!.status).toBe("failed");
    expect(queue.size()).toBe(0);
    const result = queue.getResult("t-1");
    expect(result!.error).toBe("Task cancelled");
  });

  it("returns false when cancelling unknown task", () => {
    expect(queue.cancel("unknown")).toBe(false);
  });

  it("times out a long-running task", async () => {
    const shortTimeoutQueue = createTaskQueue({ taskTimeout: 30 });

    shortTimeoutQueue.onTask(async () => {
      await new Promise((r) => setTimeout(r, 5000));
      return makeResult("t-1");
    });

    shortTimeoutQueue.enqueue(makeTask("t-1"));
    shortTimeoutQueue.start();

    await new Promise((r) => setTimeout(r, 200));

    expect(shortTimeoutQueue.getStatus("t-1")!.status).toBe("failed");
    const result = shortTimeoutQueue.getResult("t-1");
    expect(result!.error).toBe("Task timed out");
    shortTimeoutQueue.stop();
  });

  it("processes next task after previous completes", async () => {
    const processed: string[] = [];

    queue.onTask(async ({ task }) => {
      processed.push(task.id);
      return makeResult(task.id);
    });

    queue.start();
    queue.enqueue(makeTask("t-1"));

    await new Promise((r) => setTimeout(r, 50));
    expect(processed).toEqual(["t-1"]);

    queue.enqueue(makeTask("t-2"));
    await new Promise((r) => setTimeout(r, 50));
    expect(processed).toEqual(["t-1", "t-2"]);
  });

  it("stop prevents further processing", async () => {
    const processed: string[] = [];

    queue.onTask(async ({ task }) => {
      processed.push(task.id);
      return makeResult(task.id);
    });

    queue.enqueue(makeTask("t-1"));
    queue.enqueue(makeTask("t-2"));
    queue.stop();
    queue.start();

    await new Promise((r) => setTimeout(r, 50));
    expect(processed).toEqual(["t-1", "t-2"]);

    queue.stop();
    queue.enqueue(makeTask("t-3"));

    await new Promise((r) => setTimeout(r, 50));
    // t-3 should not be processed since we stopped
    expect(processed).toEqual(["t-1", "t-2"]);
  });
});
