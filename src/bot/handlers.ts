import type { Bot, Context } from "grammy";
import type { Storage } from "../storage/index.ts";
import type { TaskQueue } from "../queue/types.ts";
import type { Task } from "../lib/types.ts";
import { nanoid } from "nanoid";
import { createChildLogger } from "../lib/logger.ts";
import {
  formatAcknowledge,
  formatHistory,
  formatStatus,
  formatError,
} from "./formatter.ts";

const log = createChildLogger("bot:handlers");

export function registerHandlers(opts: {
  bot: Bot;
  storage: Storage;
  queue: TaskQueue | null;
}) {
  const { bot, storage, queue } = opts;

  bot.command("status", async (ctx) => {
    const tasks = storage.listTasks({ limit: 1 });
    const current = tasks.find((t) => t.status === "running");
    await ctx.reply(formatStatus({ running: !!current }));
  });

  bot.command("history", async (ctx) => {
    const results = storage.listTaskResults({ limit: 10 });
    await ctx.reply(formatHistory(results));
  });

  bot.command("rollback", async (ctx) => {
    // TODO: Phase 3 — Wire to git rollback
    await ctx.reply("Rollback is not yet implemented.");
  });

  bot.command("config", async (ctx) => {
    // TODO: Phase 5 — Show/update config
    await ctx.reply("Config management is not yet implemented.");
  });

  bot.on("message:text", async (ctx) => {
    await handleTextMessage({ ctx, storage, queue });
  });
}

async function handleTextMessage(opts: {
  ctx: Context;
  storage: Storage;
  queue: TaskQueue | null;
}) {
  const { ctx, storage, queue } = opts;
  const text = ctx.message?.text;
  const chatId = ctx.chat?.id;
  const messageId = ctx.message?.message_id;

  if (!text || !chatId || !messageId) return;

  await ctx.reply(formatAcknowledge());

  const task: Task = {
    id: nanoid(),
    userMessage: text,
    status: "queued",
    telegramChatId: chatId,
    telegramMessageId: messageId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  storage.saveTask(task);
  log.info({ taskId: task.id, chatId }, "Task created");

  if (queue) {
    queue.enqueue(task);
  } else {
    log.warn("No task queue configured, task saved but not processed");
    try {
      await ctx.reply("Task saved. Processing queue is not yet configured.");
    } catch (err) {
      log.error({ err }, "Failed to send queue-not-configured message");
    }
  }
}
