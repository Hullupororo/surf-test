import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTaskHandler } from "../../src/queue/orchestrator.ts";
import type { OrchestratorDeps } from "../../src/queue/orchestrator.ts";
import type { Storage } from "../../src/storage/index.ts";
import type { GitManager } from "../../src/git/index.ts";
import type { AppConfig } from "../../src/config/schema.ts";
import type { Task, TaskResult } from "../../src/lib/types.ts";
import { createTask } from "../../src/queue/task.ts";
import type { SimpleGit } from "simple-git";

function makeConfig(overrides?: Partial<AppConfig["git"]>): AppConfig {
  return {
    telegram: { botToken: "test", allowedUsers: [] },
    anthropic: { apiKey: "test" },
    git: {
      repoUrl: "https://example.com/repo.git",
      localPath: "/tmp/repo",
      branchStrategy: "direct",
      ...overrides,
    },
    deploy: { platform: "vercel", hookUrl: "", webhookSecret: "" },
    playwright: { headless: true, viewport: "1280x720" },
    agent: {
      maxRetries: 3,
      taskTimeout: 300_000,
      devServerCmd: "npm run dev",
      devServerPort: 3000,
    },
    server: { port: 4000 },
  };
}

function makeStorage(): Storage {
  const tasks = new Map<string, Task>();
  const results = new Map<string, TaskResult>();
  return {
    saveTask: vi.fn((task: Task) => tasks.set(task.id, task)),
    getTask: vi.fn((id: string) => tasks.get(id) ?? null),
    updateTask: vi.fn((id: string, updates: Partial<Task>) => {
      const existing = tasks.get(id);
      if (existing) tasks.set(id, { ...existing, ...updates });
    }),
    listTasks: vi.fn(() => []),
    saveTaskResult: vi.fn((r: TaskResult) => results.set(r.taskId, r)),
    getTaskResult: vi.fn((id: string) => results.get(id) ?? null),
    listTaskResults: vi.fn(() => []),
  };
}

function makeGitManager(): GitManager {
  return {
    init: vi.fn(async () => {}),
    pull: vi.fn(async () => {}),
    prepareBranch: vi.fn(async () => "main"),
    commitAll: vi.fn(async () => "abc123"),
    push: vi.fn(async () => {}),
    rollback: vi.fn(async () => "reverted"),
    clean: vi.fn(async () => {}),
    diff: vi.fn(async () => ""),
    getGit: vi.fn(() => ({}) as SimpleGit),
  };
}

// Mock the runAgent function
vi.mock("../../src/agent/index.ts", () => ({
  runAgent: vi.fn(),
}));

import { runAgent } from "../../src/agent/index.ts";
const mockRunAgent = vi.mocked(runAgent);

describe("createTaskHandler", () => {
  let storage: Storage;
  let gitManager: GitManager;
  let progressMessages: string[];
  let deps: OrchestratorDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = makeStorage();
    gitManager = makeGitManager();
    progressMessages = [];

    deps = {
      storage,
      gitManager,
      config: makeConfig(),
      onProgress: async ({ message }) => {
        progressMessages.push(message);
      },
    };
  });

  it("runs the full success pipeline", async () => {
    mockRunAgent.mockResolvedValue({
      success: true,
      summary: "Fixed header",
      filesChanged: ["index.html"],
      commitHash: "abc123",
      screenshotPath: null,
    });

    const handler = createTaskHandler(deps);
    const task = createTask({
      id: "t-1",
      userMessage: "Fix the header",
      telegramChatId: 1,
      telegramMessageId: 1,
    });

    const result = await handler({
      task,
      onProgress: async () => {},
    });

    expect(result.success).toBe(true);
    expect(result.summary).toBe("Fixed header");
    expect(result.commitHash).toBe("abc123");
    expect(gitManager.pull).toHaveBeenCalled();
    expect(gitManager.prepareBranch).toHaveBeenCalledWith("t-1");
    expect(storage.saveTaskResult).toHaveBeenCalledWith(result);
    expect(storage.updateTask).toHaveBeenCalledWith("t-1", {
      status: "completed",
    });
  });

  it("sends progress updates", async () => {
    mockRunAgent.mockResolvedValue({
      success: true,
      summary: "Done",
      filesChanged: [],
      commitHash: null,
      screenshotPath: null,
    });

    const handler = createTaskHandler(deps);
    const task = createTask({
      id: "t-1",
      userMessage: "test",
      telegramChatId: 1,
      telegramMessageId: 1,
    });

    await handler({ task, onProgress: async () => {} });

    expect(progressMessages).toContain("Pulling latest changes...");
    expect(progressMessages).toContain("Preparing branch...");
    expect(progressMessages).toContain("Working on changes...");
  });

  it("cleans up and fails when agent fails", async () => {
    mockRunAgent.mockResolvedValue({
      success: false,
      summary: "Could not parse file",
      filesChanged: ["broken.ts"],
      commitHash: null,
      screenshotPath: null,
    });

    const handler = createTaskHandler(deps);
    const task = createTask({
      id: "t-1",
      userMessage: "test",
      telegramChatId: 1,
      telegramMessageId: 1,
    });

    const result = await handler({ task, onProgress: async () => {} });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Could not parse file");
    expect(gitManager.clean).toHaveBeenCalled();
    expect(storage.updateTask).toHaveBeenCalledWith("t-1", {
      status: "failed",
    });
  });

  it("handles thrown errors with cleanup", async () => {
    mockRunAgent.mockRejectedValue(new Error("API down"));

    const handler = createTaskHandler(deps);
    const task = createTask({
      id: "t-1",
      userMessage: "test",
      telegramChatId: 1,
      telegramMessageId: 1,
    });

    const result = await handler({ task, onProgress: async () => {} });

    expect(result.success).toBe(false);
    expect(result.error).toBe("API down");
    expect(gitManager.clean).toHaveBeenCalled();
  });

  it("pushes on feature-branch strategy", async () => {
    mockRunAgent.mockResolvedValue({
      success: true,
      summary: "Done",
      filesChanged: [],
      commitHash: "abc123",
      screenshotPath: null,
    });

    deps.config = makeConfig({ branchStrategy: "feature-branch" });
    (gitManager.prepareBranch as ReturnType<typeof vi.fn>).mockResolvedValue(
      "task/t-1",
    );

    const handler = createTaskHandler(deps);
    const task = createTask({
      id: "t-1",
      userMessage: "test",
      telegramChatId: 1,
      telegramMessageId: 1,
    });

    await handler({ task, onProgress: async () => {} });

    expect(gitManager.push).toHaveBeenCalledWith("task/t-1");
  });

  it("pushes on direct strategy when commit exists", async () => {
    mockRunAgent.mockResolvedValue({
      success: true,
      summary: "Done",
      filesChanged: [],
      commitHash: "abc123",
      screenshotPath: null,
    });

    const handler = createTaskHandler(deps);
    const task = createTask({
      id: "t-1",
      userMessage: "test",
      telegramChatId: 1,
      telegramMessageId: 1,
    });

    await handler({ task, onProgress: async () => {} });

    expect(gitManager.push).toHaveBeenCalledWith("main");
  });

  it("still cleans up if cleanup itself fails", async () => {
    mockRunAgent.mockRejectedValue(new Error("Agent crash"));
    (gitManager.clean as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Clean failed"),
    );

    const handler = createTaskHandler(deps);
    const task = createTask({
      id: "t-1",
      userMessage: "test",
      telegramChatId: 1,
      telegramMessageId: 1,
    });

    const result = await handler({ task, onProgress: async () => {} });

    // Still returns the original error, not the cleanup error
    expect(result.success).toBe(false);
    expect(result.error).toBe("Agent crash");
    expect(storage.updateTask).toHaveBeenCalledWith("t-1", {
      status: "failed",
    });
  });
});
