import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { simpleGit } from "simple-git";
import type { SimpleGit } from "simple-git";
import { handleToolCall } from "../../src/agent/tool-handlers.ts";
import type { ToolHandlerDeps } from "../../src/agent/tool-handlers.ts";

describe("tool-handlers", () => {
  let repoPath: string;
  let git: SimpleGit;
  let deps: ToolHandlerDeps;

  beforeEach(async () => {
    repoPath = mkdtempSync(join(tmpdir(), "agent-tools-"));
    git = simpleGit(repoPath);
    await git.init();
    await git.addConfig("user.email", "test@test.com");
    await git.addConfig("user.name", "Test");

    writeFileSync(join(repoPath, "hello.txt"), "Hello World");
    await git.add(".");
    await git.commit("init");

    deps = {
      repoPath,
      git,
      onProgress: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("read_file reads file content", async () => {
    const result = await handleToolCall({
      name: "read_file",
      input: { path: "hello.txt" },
      deps,
    });
    expect(result.content).toBe("Hello World");
    expect(result.isError).toBeUndefined();
  });

  it("read_file returns error for missing file", async () => {
    const result = await handleToolCall({
      name: "read_file",
      input: { path: "nonexistent.txt" },
      deps,
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Error");
  });

  it("write_file creates a new file", async () => {
    const result = await handleToolCall({
      name: "write_file",
      input: { path: "new.txt", content: "New content" },
      deps,
    });
    expect(result.content).toContain("Written");
    expect(readFileSync(join(repoPath, "new.txt"), "utf-8")).toBe("New content");
  });

  it("edit_file replaces exact string", async () => {
    const result = await handleToolCall({
      name: "edit_file",
      input: { path: "hello.txt", old_string: "World", new_string: "Test" },
      deps,
    });
    expect(result.content).toContain("Edited");
    expect(readFileSync(join(repoPath, "hello.txt"), "utf-8")).toBe("Hello Test");
  });

  it("edit_file returns error if old_string not found", async () => {
    const result = await handleToolCall({
      name: "edit_file",
      input: { path: "hello.txt", old_string: "MISSING", new_string: "x" },
      deps,
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not found");
  });

  it("edit_file returns error if old_string not unique", async () => {
    writeFileSync(join(repoPath, "dup.txt"), "aaa bbb aaa");
    const result = await handleToolCall({
      name: "edit_file",
      input: { path: "dup.txt", old_string: "aaa", new_string: "x" },
      deps,
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("2 times");
  });

  it("run_bash executes command", async () => {
    const result = await handleToolCall({
      name: "run_bash",
      input: { command: "echo hello" },
      deps,
    });
    expect(result.content).toContain("hello");
  });

  it("run_bash returns error for failing command", async () => {
    const result = await handleToolCall({
      name: "run_bash",
      input: { command: "exit 1" },
      deps,
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Exit code");
  });

  it("git_diff shows changes", async () => {
    writeFileSync(join(repoPath, "hello.txt"), "Changed");
    const result = await handleToolCall({
      name: "git_diff",
      input: {},
      deps,
    });
    expect(result.content).toContain("Changed");
  });

  it("git_commit commits changes", async () => {
    writeFileSync(join(repoPath, "new.txt"), "data");
    const result = await handleToolCall({
      name: "git_commit",
      input: { message: "test commit" },
      deps,
    });
    expect(result.content).toContain("Committed");
  });

  it("project_map returns file listing", async () => {
    const result = await handleToolCall({
      name: "project_map",
      input: {},
      deps,
    });
    expect(result.content).toContain("hello.txt");
  });

  it("detect_conventions returns info", async () => {
    writeFileSync(join(repoPath, "package.json"), '{"name":"test"}');
    const result = await handleToolCall({
      name: "detect_conventions",
      input: {},
      deps,
    });
    expect(result.content).toContain("package.json");
  });

  it("report_progress calls onProgress", async () => {
    const result = await handleToolCall({
      name: "report_progress",
      input: { message: "Building..." },
      deps,
    });
    expect(result.content).toBe("Progress reported");
    expect(deps.onProgress).toHaveBeenCalledWith("Building...");
  });

  it("unknown tool returns error", async () => {
    const result = await handleToolCall({
      name: "fake_tool",
      input: {},
      deps,
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Unknown tool");
  });

  it("blocks path traversal", async () => {
    const result = await handleToolCall({
      name: "read_file",
      input: { path: "../../etc/passwd" },
      deps,
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("traversal");
  });
});
