import { describe, it, expect, vi, beforeEach } from "vitest";
import { Bot } from "grammy";
import { registerHandlers } from "../../src/bot/handlers.ts";
import { createMemoryStorage } from "../../src/storage/memory.ts";
import type { Storage } from "../../src/storage/index.ts";

function createMockBot() {
  const handlers: Record<string, Function> = {};
  const commands: Record<string, Function> = {};

  const bot = {
    command: vi.fn((name: string, handler: Function) => {
      commands[name] = handler;
    }),
    on: vi.fn((filter: string, handler: Function) => {
      handlers[filter] = handler;
    }),
    _commands: commands,
    _handlers: handlers,
  };

  return bot as any;
}

function createMockCtx(opts: { text?: string; chatId?: number; messageId?: number }) {
  return {
    message: {
      text: opts.text ?? "Change the title",
      message_id: opts.messageId ?? 1,
    },
    chat: { id: opts.chatId ?? 100 },
    from: { id: 42 },
    reply: vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe("registerHandlers", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it("registers /status, /history, /rollback, /config commands", () => {
    const bot = createMockBot();
    registerHandlers({ bot, storage, queue: null });

    expect(bot.command).toHaveBeenCalledWith("status", expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith("history", expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith("rollback", expect.any(Function));
    expect(bot.command).toHaveBeenCalledWith("config", expect.any(Function));
  });

  it("registers message:text handler", () => {
    const bot = createMockBot();
    registerHandlers({ bot, storage, queue: null });

    expect(bot.on).toHaveBeenCalledWith("message:text", expect.any(Function));
  });

  it("/status replies with no task running", async () => {
    const bot = createMockBot();
    registerHandlers({ bot, storage, queue: null });
    const ctx = createMockCtx({});

    await bot._commands["status"](ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("No task"));
  });

  it("/history replies with no changes", async () => {
    const bot = createMockBot();
    registerHandlers({ bot, storage, queue: null });
    const ctx = createMockCtx({});

    await bot._commands["history"](ctx);

    expect(ctx.reply).toHaveBeenCalledWith("No changes yet.");
  });

  it("text message creates task in storage", async () => {
    const bot = createMockBot();
    registerHandlers({ bot, storage, queue: null });
    const ctx = createMockCtx({ text: "Make button blue", chatId: 200, messageId: 5 });

    await bot._handlers["message:text"](ctx);

    expect(ctx.reply).toHaveBeenCalledWith("Got it, working on it...");

    const tasks = storage.listTasks({ limit: 10 });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.userMessage).toBe("Make button blue");
    expect(tasks[0]!.telegramChatId).toBe(200);
    expect(tasks[0]!.status).toBe("queued");
  });

  it("text message enqueues task when queue provided", async () => {
    const bot = createMockBot();
    const mockQueue = {
      enqueue: vi.fn(),
      cancel: vi.fn(),
      getStatus: vi.fn(),
      onTask: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    registerHandlers({ bot, storage, queue: mockQueue });
    const ctx = createMockCtx({ text: "Fix header" });

    await bot._handlers["message:text"](ctx);

    expect(mockQueue.enqueue).toHaveBeenCalledOnce();
    expect(mockQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: "Fix header" }),
    );
  });
});
