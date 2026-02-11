import { describe, it, expect, vi } from "vitest";
import { createTelegramReporter } from "../../src/agent/skills/telegram-reporter.ts";
import { triggerDeploy } from "../../src/agent/skills/deploy-trigger.ts";
import { commitAndPush, rollbackChanges, cleanWorkingDirectory } from "../../src/agent/skills/git-ops.ts";
import { runBuild } from "../../src/agent/skills/build-runner.ts";
import type { GitManager } from "../../src/git/index.ts";
import type { DeployManager } from "../../src/deploy/index.ts";
import type { SimpleGit } from "simple-git";

function makeGitManager(overrides?: Partial<GitManager>): GitManager {
  return {
    init: vi.fn(async () => {}),
    pull: vi.fn(async () => {}),
    prepareBranch: vi.fn(async () => "main"),
    commitAll: vi.fn(async () => "abc123"),
    push: vi.fn(async () => {}),
    rollback: vi.fn(async () => "revert-456"),
    clean: vi.fn(async () => {}),
    diff: vi.fn(async () => ""),
    getGit: vi.fn(() => ({}) as SimpleGit),
    ...overrides,
  };
}

describe("TelegramReporter", () => {
  it("sends progress messages", async () => {
    const messages: string[] = [];
    const reporter = createTelegramReporter(async (msg) => {
      messages.push(msg);
    });

    await reporter.sendProgress("Working on it...");
    expect(messages).toEqual(["Working on it..."]);
  });

  it("sends success result", async () => {
    const messages: string[] = [];
    const reporter = createTelegramReporter(async (msg) => {
      messages.push(msg);
    });

    await reporter.sendResult({
      success: true,
      summary: "Fixed the header",
      filesChanged: ["index.html", "style.css"],
      commitHash: "abc123",
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("successfully");
    expect(messages[0]).toContain("Fixed the header");
    expect(messages[0]).toContain("index.html");
    expect(messages[0]).toContain("abc123");
  });

  it("sends failure result", async () => {
    const messages: string[] = [];
    const reporter = createTelegramReporter(async (msg) => {
      messages.push(msg);
    });

    await reporter.sendResult({
      success: false,
      summary: "Could not parse",
      filesChanged: [],
      commitHash: null,
    });

    expect(messages[0]).toContain("failed");
  });

  it("sends error messages", async () => {
    const messages: string[] = [];
    const reporter = createTelegramReporter(async (msg) => {
      messages.push(msg);
    });

    await reporter.sendError("Something went wrong");
    expect(messages[0]).toContain("Something went wrong");
  });

  it("truncates long file lists", async () => {
    const messages: string[] = [];
    const reporter = createTelegramReporter(async (msg) => {
      messages.push(msg);
    });

    const manyFiles = Array.from({ length: 15 }, (_, i) => `file${i}.ts`);
    await reporter.sendResult({
      success: true,
      summary: "Many changes",
      filesChanged: manyFiles,
      commitHash: null,
    });

    expect(messages[0]).toContain("file9.ts");
    expect(messages[0]).toContain("and 5 more");
    expect(messages[0]).not.toContain("file10.ts");
  });
});

describe("triggerDeploy", () => {
  it("triggers deploy successfully", async () => {
    const deployManager: DeployManager = {
      trigger: vi.fn(async () => ({ deployId: "d-1", platform: "vercel" })),
      getPlatform: vi.fn(() => "vercel"),
    };

    const result = await triggerDeploy({ deployManager });

    expect(result.triggered).toBe(true);
    expect(result.deployId).toBe("d-1");
    expect(result.error).toBeNull();
  });

  it("handles deploy failure", async () => {
    const deployManager: DeployManager = {
      trigger: vi.fn(async () => {
        throw new Error("Hook returned 500");
      }),
      getPlatform: vi.fn(() => "vercel"),
    };

    const result = await triggerDeploy({ deployManager });

    expect(result.triggered).toBe(false);
    expect(result.error).toBe("Hook returned 500");
  });
});

describe("commitAndPush", () => {
  it("commits changes", async () => {
    const git = makeGitManager();
    const result = await commitAndPush({
      gitManager: git,
      message: "fix: header",
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("abc123");
    expect(git.commitAll).toHaveBeenCalledWith("fix: header");
    expect(git.push).not.toHaveBeenCalled();
  });

  it("commits and pushes when branch specified", async () => {
    const git = makeGitManager();
    const result = await commitAndPush({
      gitManager: git,
      message: "fix: header",
      branch: "main",
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("pushed to main");
    expect(git.push).toHaveBeenCalledWith("main");
  });

  it("handles commit failure", async () => {
    const git = makeGitManager({
      commitAll: vi.fn(async () => {
        throw new Error("Nothing to commit");
      }),
    });

    const result = await commitAndPush({
      gitManager: git,
      message: "fix: nothing",
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("Nothing to commit");
  });
});

describe("rollbackChanges", () => {
  it("rolls back successfully", async () => {
    const git = makeGitManager();
    const result = await rollbackChanges({ gitManager: git });

    expect(result.success).toBe(true);
    expect(result.message).toContain("revert-456");
  });
});

describe("cleanWorkingDirectory", () => {
  it("cleans successfully", async () => {
    const git = makeGitManager();
    const result = await cleanWorkingDirectory({ gitManager: git });

    expect(result.success).toBe(true);
    expect(git.clean).toHaveBeenCalled();
  });
});

describe("runBuild", () => {
  it("runs a successful command", () => {
    const result = runBuild({
      command: "echo hello",
      cwd: process.cwd(),
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("hello");
    expect(result.exitCode).toBe(0);
  });

  it("captures failed command output", () => {
    const result = runBuild({
      command: "node -e \"process.exit(1)\"",
      cwd: process.cwd(),
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
  });
});
