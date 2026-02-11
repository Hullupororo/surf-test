import { describe, it, expect } from "vitest";
import {
  formatAcknowledge,
  formatProgress,
  formatTaskResult,
  formatError,
  formatHistory,
  formatStatus,
} from "../../src/bot/formatter.ts";
import type { TaskResult } from "../../src/lib/types.ts";

describe("formatter", () => {
  it("formatAcknowledge returns expected text", () => {
    expect(formatAcknowledge()).toBe("Got it, working on it...");
  });

  it("formatProgress wraps message", () => {
    expect(formatProgress("Reading files...")).toContain("Reading files...");
  });

  it("formatTaskResult for success", () => {
    const result: TaskResult = {
      taskId: "t1",
      success: true,
      summary: "Changed hero title",
      filesChanged: ["src/index.html"],
      commitHash: "abc12345def",
      screenshotPath: null,
      error: null,
    };
    const text = formatTaskResult(result);
    expect(text).toContain("Changes applied");
    expect(text).toContain("Changed hero title");
    expect(text).toContain("src/index.html");
    expect(text).toContain("abc12345");
  });

  it("formatTaskResult for failure", () => {
    const result: TaskResult = {
      taskId: "t2",
      success: false,
      summary: "",
      filesChanged: [],
      commitHash: null,
      screenshotPath: null,
      error: "Build failed",
    };
    const text = formatTaskResult(result);
    expect(text).toContain("failed");
    expect(text).toContain("Build failed");
  });

  it("formatError handles Error instances", () => {
    expect(formatError(new Error("oops"))).toContain("oops");
  });

  it("formatError handles non-Error values", () => {
    expect(formatError("something")).toContain("unexpected");
  });

  it("formatHistory with no results", () => {
    expect(formatHistory([])).toBe("No changes yet.");
  });

  it("formatHistory with results", () => {
    const results: TaskResult[] = [
      {
        taskId: "t1",
        success: true,
        summary: "Fixed button",
        filesChanged: [],
        commitHash: "abc12345",
        screenshotPath: null,
        error: null,
      },
    ];
    const text = formatHistory(results);
    expect(text).toContain("Fixed button");
    expect(text).toContain("abc12345");
  });

  it("formatStatus when no task running", () => {
    expect(formatStatus({ running: false })).toContain("No task");
  });

  it("formatStatus when task running", () => {
    expect(formatStatus({ running: true, message: "Building..." })).toContain("Building...");
  });
});
