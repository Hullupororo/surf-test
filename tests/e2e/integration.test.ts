import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTaskQueue } from "../../src/queue/index.ts";
import { createTask } from "../../src/queue/task.ts";
import { createMemoryStorage } from "../../src/storage/memory.ts";
import { createApp } from "../../src/server.ts";
import type { TaskResult } from "../../src/lib/types.ts";

describe("Integration: Queue + Storage", () => {
  it("processes task and stores result", async () => {
    const storage = createMemoryStorage();
    const queue = createTaskQueue({ taskTimeout: 5000 });

    queue.onTask(async ({ task }) => {
      const result: TaskResult = {
        taskId: task.id,
        success: true,
        summary: "Fixed the header",
        filesChanged: ["index.html"],
        commitHash: "abc123",
        screenshotPath: null,
        error: null,
      };
      storage.saveTaskResult(result);
      storage.updateTask(task.id, { status: "completed" });
      return result;
    });

    const task = createTask({
      id: "t-1",
      userMessage: "Fix the header",
      telegramChatId: 123,
      telegramMessageId: 1,
    });
    storage.saveTask(task);
    queue.enqueue(task);
    queue.start();

    await new Promise((r) => setTimeout(r, 100));

    const stored = storage.getTaskResult("t-1");
    expect(stored).toBeDefined();
    expect(stored!.success).toBe(true);
    expect(stored!.summary).toBe("Fixed the header");

    const taskStatus = storage.getTask("t-1");
    expect(taskStatus!.status).toBe("completed");

    queue.stop();
  });
});

describe("Integration: Server + Webhooks", () => {
  let events: unknown[];

  beforeEach(() => {
    events = [];
  });

  it("health endpoint works", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("ok");
  });

  it("webhook endpoint processes deploy events", async () => {
    const storage = createMemoryStorage();
    storage.saveTask({
      id: "t-1",
      userMessage: "test",
      status: "completed",
      telegramChatId: 999,
      telegramMessageId: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const app = createApp({
      webhook: {
        storage,
        webhookSecret: "",
        onBuildEvent: async (evt) => {
          events.push(evt);
        },
      },
    });

    const res = await app.request("/webhook/deploy/vercel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "deployment.succeeded",
        payload: {
          deployment: { id: "dpl-1", url: "app.vercel.app" },
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(events).toHaveLength(1);
    const evt = events[0] as Record<string, unknown>;
    expect(evt["chatId"]).toBe(999);
    expect(evt["status"]).toBe("success");
  });

  it("returns 503 when webhook not configured", async () => {
    const app = createApp();
    const res = await app.request("/webhook/deploy/vercel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(503);
  });
});

describe("Integration: Classifier → System Prompt", () => {
  it("classifies and builds prompt with modules", async () => {
    const { classifyTask } = await import(
      "../../src/agent/prompt-modules/classifier.ts"
    );
    const { buildProjectContext, buildSystemPrompt } = await import(
      "../../src/agent/context.ts"
    );
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");

    const tmpDir = mkdtempSync(join(tmpdir(), "integration-"));
    writeFileSync(
      join(tmpDir, "package.json"),
      JSON.stringify({ dependencies: { react: "^18" } }),
    );

    const context = await buildProjectContext(tmpDir);
    const modules = classifyTask("Add a modal component with CSS");
    const prompt = buildSystemPrompt({
      context,
      additionalModules: modules.map((m) => m.prompt),
    });

    expect(prompt).toContain("React");
    expect(prompt).toContain("Frontend Expert");
  });
});
