import type { Context, NextFunction } from "grammy";
import { createChildLogger } from "../lib/logger.ts";

const log = createChildLogger("bot:auth");

export function createAuthMiddleware(allowedUsers: number[]) {
  return async (ctx: Context, next: NextFunction) => {
    const userId = ctx.from?.id;

    if (!userId) {
      log.warn("Message without user ID, ignoring");
      return;
    }

    if (allowedUsers.length > 0 && !allowedUsers.includes(userId)) {
      log.warn({ userId }, "Unauthorized user attempted access");
      await ctx.reply("You are not authorized to use this bot.");
      return;
    }

    await next();
  };
}
