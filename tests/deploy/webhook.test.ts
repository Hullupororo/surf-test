import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { createWebhookRoutes, verifySignature } from "../../src/webhook/index.ts";
import type { Storage } from "../../src/storage/index.ts";
import type { Task } from "../../src/lib/types.ts";

function makeStorage(tasks?: Task[]): Storage {
  return {
    saveTask: vi.fn(),
    getTask: vi.fn((id: string) => (tasks ?? []).find((t) => t.id === id) ?? null),
    updateTask: vi.fn(),
    listTasks: vi.fn(() => tasks ?? []),
    saveTaskResult: vi.fn(),
    getTaskResult: vi.fn(),
    listTaskResults: vi.fn(() => []),
  };
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

describe("verifySignature", () => {
  it("verifies a valid signature", () => {
    const payload = '{"test":true}';
    const secret = "my-secret";
    const signature = signPayload(payload, secret);

    expect(
      verifySignature({ payload, signature, secret }),
    ).toBe(true);
  });

  it("verifies sha256= prefixed signature", () => {
    const payload = '{"test":true}';
    const secret = "my-secret";
    const signature = "sha256=" + signPayload(payload, secret);

    expect(
      verifySignature({ payload, signature, secret }),
    ).toBe(true);
  });

  it("rejects invalid signature", () => {
    expect(
      verifySignature({
        payload: '{"test":true}',
        signature: "invalid-hex",
        secret: "my-secret",
      }),
    ).toBe(false);
  });

  it("rejects wrong secret", () => {
    const payload = '{"test":true}';
    const signature = signPayload(payload, "correct-secret");

    expect(
      verifySignature({ payload, signature, secret: "wrong-secret" }),
    ).toBe(false);
  });
});

describe("createWebhookRoutes", () => {
  it("accepts valid webhook without secret", async () => {
    const events: unknown[] = [];
    const task: Task = {
      id: "t-1",
      userMessage: "test",
      status: "completed",
      telegramChatId: 123,
      telegramMessageId: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const app = createWebhookRoutes({
      storage: makeStorage([task]),
      webhookSecret: "",
      onBuildEvent: async (evt) => {
        events.push(evt);
      },
    });

    const res = await app.request("/vercel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "deployment.succeeded",
        payload: { deployment: { id: "dpl-1", url: "app.vercel.app" } },
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean; status: string };
    expect(json.received).toBe(true);
    expect(json.status).toBe("success");
    expect(events).toHaveLength(1);
  });

  it("rejects missing signature when secret is configured", async () => {
    const app = createWebhookRoutes({
      storage: makeStorage(),
      webhookSecret: "secret-123",
      onBuildEvent: async () => {},
    });

    const res = await app.request("/vercel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "deployment.succeeded" }),
    });

    expect(res.status).toBe(401);
  });

  it("rejects invalid signature", async () => {
    const app = createWebhookRoutes({
      storage: makeStorage(),
      webhookSecret: "secret-123",
      onBuildEvent: async () => {},
    });

    const res = await app.request("/vercel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-signature": "bad-signature",
      },
      body: JSON.stringify({ type: "deployment.succeeded" }),
    });

    expect(res.status).toBe(401);
  });

  it("accepts valid signature", async () => {
    const secret = "secret-123";
    const payload = JSON.stringify({
      type: "deployment.succeeded",
      payload: { deployment: { id: "dpl-1" } },
    });
    const signature = signPayload(payload, secret);

    const app = createWebhookRoutes({
      storage: makeStorage(),
      webhookSecret: secret,
      onBuildEvent: async () => {},
    });

    const res = await app.request("/vercel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-signature": signature,
      },
      body: payload,
    });

    expect(res.status).toBe(200);
  });

  it("handles netlify webhook", async () => {
    const app = createWebhookRoutes({
      storage: makeStorage(),
      webhookSecret: "",
      onBuildEvent: async () => {},
    });

    const res = await app.request("/netlify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "ready", id: "build-1" }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("success");
  });

  it("fires onBuildEvent with mapped task data", async () => {
    const events: unknown[] = [];
    const task: Task = {
      id: "t-5",
      userMessage: "update footer",
      status: "completed",
      telegramChatId: 999,
      telegramMessageId: 10,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const app = createWebhookRoutes({
      storage: makeStorage([task]),
      webhookSecret: "",
      onBuildEvent: async (evt) => {
        events.push(evt);
      },
    });

    await app.request("/custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "d-1",
        status: "success",
        url: "https://app.com",
      }),
    });

    expect(events).toHaveLength(1);
    const evt = events[0] as Record<string, unknown>;
    expect(evt["chatId"]).toBe(999);
    expect(evt["taskId"]).toBe("t-5");
    expect(evt["status"]).toBe("success");
    expect(evt["url"]).toBe("https://app.com");
  });
});
