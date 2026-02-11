import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDeployManager } from "../../src/deploy/index.ts";
import type { AppConfig } from "../../src/config/schema.ts";

describe("createDeployManager", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function makeConfig(
    platform: "vercel" | "netlify" | "custom",
  ): AppConfig["deploy"] {
    return {
      platform,
      hookUrl: "https://example.com/deploy-hook",
      webhookSecret: "secret",
    };
  }

  it("creates a vercel deploy manager", () => {
    const manager = createDeployManager(makeConfig("vercel"));
    expect(manager.getPlatform()).toBe("vercel");
  });

  it("creates a netlify deploy manager", () => {
    const manager = createDeployManager(makeConfig("netlify"));
    expect(manager.getPlatform()).toBe("netlify");
  });

  it("creates a custom deploy manager", () => {
    const manager = createDeployManager(makeConfig("custom"));
    expect(manager.getPlatform()).toBe("custom");
  });

  it("triggers vercel deploy successfully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: { id: "deploy-123" } }),
    }) as unknown as typeof fetch;

    const manager = createDeployManager(makeConfig("vercel"));
    const result = await manager.trigger();

    expect(result.deployId).toBe("deploy-123");
    expect(result.platform).toBe("vercel");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.com/deploy-hook",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("triggers netlify deploy successfully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const manager = createDeployManager(makeConfig("netlify"));
    const result = await manager.trigger();

    expect(result.platform).toBe("netlify");
  });

  it("throws on failed deploy hook response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }) as unknown as typeof fetch;

    const manager = createDeployManager(makeConfig("vercel"));
    await expect(manager.trigger()).rejects.toThrow("500");
  });

  it("throws when hook URL is empty", async () => {
    const config: AppConfig["deploy"] = {
      platform: "vercel",
      hookUrl: "",
      webhookSecret: "",
    };
    const manager = createDeployManager(config);
    await expect(manager.trigger()).rejects.toThrow("not configured");
  });
});
