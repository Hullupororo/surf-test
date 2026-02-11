import { describe, it, expect } from "vitest";
import {
  parseVercelWebhook,
  parseNetlifyWebhook,
  parseCustomWebhook,
  parseWebhook,
} from "../../src/webhook/parser.ts";

describe("parseVercelWebhook", () => {
  it("parses deployment success", () => {
    const result = parseVercelWebhook({
      type: "deployment.succeeded",
      payload: {
        deployment: {
          id: "dpl-123",
          url: "my-app.vercel.app",
          meta: { githubCommitSha: "abc123" },
        },
      },
    });

    expect(result.platform).toBe("vercel");
    expect(result.status).toBe("success");
    expect(result.deployId).toBe("dpl-123");
    expect(result.url).toBe("https://my-app.vercel.app");
    expect(result.commitHash).toBe("abc123");
    expect(result.error).toBeNull();
  });

  it("parses deployment error", () => {
    const result = parseVercelWebhook({
      type: "deployment.error",
      payload: {
        deployment: { id: "dpl-456" },
        error: "Build failed: module not found",
      },
    });

    expect(result.status).toBe("failure");
    expect(result.error).toBe("Build failed: module not found");
  });

  it("parses deployment created as building", () => {
    const result = parseVercelWebhook({
      type: "deployment.created",
      payload: {
        deployment: { id: "dpl-789" },
      },
    });

    expect(result.status).toBe("building");
  });

  it("handles unknown event type", () => {
    const result = parseVercelWebhook({ type: "something.else" });
    expect(result.status).toBe("unknown");
  });
});

describe("parseNetlifyWebhook", () => {
  it("parses ready state as success", () => {
    const result = parseNetlifyWebhook({
      id: "build-1",
      state: "ready",
      ssl_url: "https://my-site.netlify.app",
      commit_ref: "def456",
    });

    expect(result.platform).toBe("netlify");
    expect(result.status).toBe("success");
    expect(result.url).toBe("https://my-site.netlify.app");
    expect(result.commitHash).toBe("def456");
  });

  it("parses error state as failure", () => {
    const result = parseNetlifyWebhook({
      id: "build-2",
      state: "error",
      error_message: "Build script returned non-zero exit code",
    });

    expect(result.status).toBe("failure");
    expect(result.error).toBe("Build script returned non-zero exit code");
  });

  it("parses building state", () => {
    const result = parseNetlifyWebhook({
      id: "build-3",
      state: "building",
    });
    expect(result.status).toBe("building");
  });

  it("falls back to url when ssl_url missing", () => {
    const result = parseNetlifyWebhook({
      id: "build-4",
      state: "ready",
      url: "http://my-site.netlify.app",
    });
    expect(result.url).toBe("http://my-site.netlify.app");
  });
});

describe("parseCustomWebhook", () => {
  it("parses success payload", () => {
    const result = parseCustomWebhook({
      id: "custom-1",
      status: "success",
      url: "https://my-app.com",
      commit_hash: "ghi789",
    });

    expect(result.platform).toBe("custom");
    expect(result.status).toBe("success");
    expect(result.url).toBe("https://my-app.com");
    expect(result.commitHash).toBe("ghi789");
  });

  it("parses failure payload", () => {
    const result = parseCustomWebhook({
      id: "custom-2",
      status: "failure",
      error: "Timeout",
    });

    expect(result.status).toBe("failure");
    expect(result.error).toBe("Timeout");
  });

  it("defaults to unknown status", () => {
    const result = parseCustomWebhook({});
    expect(result.status).toBe("unknown");
    expect(result.deployId).toBe("unknown");
  });
});

describe("parseWebhook", () => {
  it("dispatches to vercel parser", () => {
    const result = parseWebhook({
      platform: "vercel",
      payload: {
        type: "deployment.succeeded",
        payload: { deployment: { id: "dpl-1" } },
      },
    });
    expect(result.platform).toBe("vercel");
  });

  it("dispatches to netlify parser", () => {
    const result = parseWebhook({
      platform: "netlify",
      payload: { state: "ready", id: "b-1" },
    });
    expect(result.platform).toBe("netlify");
  });

  it("dispatches to custom parser", () => {
    const result = parseWebhook({
      platform: "custom",
      payload: { status: "success" },
    });
    expect(result.platform).toBe("custom");
  });

  it("returns unknown for unrecognized platform", () => {
    const result = parseWebhook({
      platform: "aws",
      payload: { anything: true },
    });
    expect(result.platform).toBe("aws");
    expect(result.status).toBe("unknown");
  });
});
