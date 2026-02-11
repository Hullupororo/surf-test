import { describe, it, expect, vi } from "vitest";
import { createAuthMiddleware } from "../../src/bot/auth.ts";

function createMockContext(userId?: number) {
  return {
    from: userId !== undefined ? { id: userId } : undefined,
    reply: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe("createAuthMiddleware", () => {
  it("calls next for allowed user", async () => {
    const middleware = createAuthMiddleware([123]);
    const ctx = createMockContext(123);
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("rejects unauthorized user", async () => {
    const middleware = createAuthMiddleware([123]);
    const ctx = createMockContext(999);
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith("You are not authorized to use this bot.");
  });

  it("allows all users when allowlist is empty", async () => {
    const middleware = createAuthMiddleware([]);
    const ctx = createMockContext(999);
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("ignores messages without user ID", async () => {
    const middleware = createAuthMiddleware([123]);
    const ctx = createMockContext(undefined);
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});
