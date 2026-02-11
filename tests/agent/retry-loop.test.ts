import { describe, it, expect, vi } from "vitest";
import { runWithRetry } from "../../src/agent/retry-loop.ts";
import type { AgentResult } from "../../src/lib/types.ts";

const successResult: AgentResult = {
  success: true,
  summary: "Done",
  filesChanged: ["a.ts"],
  commitHash: "abc123",
  screenshotPath: null,
};

const failResult: AgentResult = {
  success: false,
  summary: "Build failed",
  filesChanged: [],
  commitHash: null,
  screenshotPath: null,
};

describe("runWithRetry", () => {
  it("returns on first success", async () => {
    const agentFn = vi.fn().mockResolvedValue(successResult);
    const onProgress = vi.fn().mockResolvedValue(undefined);

    const result = await runWithRetry({
      userMessage: "fix it",
      maxRetries: 3,
      agentFn,
      onProgress,
    });

    expect(result.success).toBe(true);
    expect(agentFn).toHaveBeenCalledOnce();
  });

  it("retries on failure and succeeds", async () => {
    const agentFn = vi.fn()
      .mockResolvedValueOnce(failResult)
      .mockResolvedValueOnce(successResult);
    const onProgress = vi.fn().mockResolvedValue(undefined);

    const result = await runWithRetry({
      userMessage: "fix it",
      maxRetries: 3,
      agentFn,
      onProgress,
    });

    expect(result.success).toBe(true);
    expect(agentFn).toHaveBeenCalledTimes(2);
    expect(agentFn).toHaveBeenLastCalledWith(
      expect.objectContaining({ errorContext: "Build failed", attempt: 2 }),
    );
  });

  it("exhausts retries and returns failure", async () => {
    const agentFn = vi.fn().mockResolvedValue(failResult);
    const onProgress = vi.fn().mockResolvedValue(undefined);

    const result = await runWithRetry({
      userMessage: "fix it",
      maxRetries: 2,
      agentFn,
      onProgress,
    });

    expect(result.success).toBe(false);
    expect(result.summary).toContain("3 attempts");
    expect(agentFn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("handles thrown errors as retries", async () => {
    const agentFn = vi.fn()
      .mockRejectedValueOnce(new Error("crash"))
      .mockResolvedValueOnce(successResult);
    const onProgress = vi.fn().mockResolvedValue(undefined);

    const result = await runWithRetry({
      userMessage: "fix it",
      maxRetries: 2,
      agentFn,
      onProgress,
    });

    expect(result.success).toBe(true);
    expect(agentFn).toHaveBeenCalledTimes(2);
  });

  it("sends progress on retries", async () => {
    const agentFn = vi.fn()
      .mockResolvedValueOnce(failResult)
      .mockResolvedValueOnce(successResult);
    const onProgress = vi.fn().mockResolvedValue(undefined);

    await runWithRetry({
      userMessage: "fix it",
      maxRetries: 3,
      agentFn,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith("Retry attempt 1/3...");
  });
});
