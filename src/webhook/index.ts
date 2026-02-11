import { Hono } from "hono";
import type { Context } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Storage } from "../storage/index.ts";
import { parseWebhook } from "./parser.ts";
import { mapWebhookToTask } from "./mapper.ts";
import { createChildLogger } from "../lib/logger.ts";

const log = createChildLogger("webhook");

export interface WebhookHandlerDeps {
  storage: Storage;
  webhookSecret: string;
  onBuildEvent: (opts: {
    chatId: number;
    taskId: string;
    status: "success" | "failure" | "building" | "unknown";
    url: string | null;
    error: string | null;
  }) => Promise<void>;
}

export function createWebhookRoutes(deps: WebhookHandlerDeps): Hono {
  const { storage, webhookSecret, onBuildEvent } = deps;
  const app = new Hono();

  app.post("/:platform", async (c) => {
    const platform = c.req.param("platform");

    // Signature verification if secret is configured
    if (webhookSecret) {
      const signature =
        c.req.header("x-webhook-signature") ??
        c.req.header("x-hub-signature-256") ??
        c.req.header("x-vercel-signature") ??
        c.req.header("x-webhook-secret");

      if (!signature) {
        log.warn({ platform }, "Missing webhook signature");
        return c.json({ error: "Missing signature" }, 401);
      }

      const body = await c.req.text();
      const isValid = verifySignature({
        payload: body,
        signature,
        secret: webhookSecret,
      });

      if (!isValid) {
        log.warn({ platform }, "Invalid webhook signature");
        return c.json({ error: "Invalid signature" }, 401);
      }

      // Re-parse body as JSON since we consumed it
      const payload = JSON.parse(body) as Record<string, unknown>;
      return await handleWebhook({
        platform,
        payload,
        storage,
        onBuildEvent,
        c,
      });
    }

    const payload = (await c.req.json()) as Record<string, unknown>;
    return await handleWebhook({ platform, payload, storage, onBuildEvent, c });
  });

  return app;
}

async function handleWebhook(opts: {
  platform: string;
  payload: Record<string, unknown>;
  storage: Storage;
  onBuildEvent: WebhookHandlerDeps["onBuildEvent"];
  c: Context;
}) {
  const { platform, payload, storage, onBuildEvent, c } = opts;

  const parsed = parseWebhook({ platform, payload });
  log.info(
    { platform, status: parsed.status, deployId: parsed.deployId },
    "Webhook received",
  );

  const mapped = mapWebhookToTask({ webhook: parsed, storage });

  if (mapped) {
    await onBuildEvent({
      chatId: mapped.task.telegramChatId,
      taskId: mapped.task.id,
      status: parsed.status,
      url: parsed.url,
      error: parsed.error,
    });
  }

  return c.json({ received: true, status: parsed.status });
}

export function verifySignature(opts: {
  payload: string;
  signature: string;
  secret: string;
}): boolean {
  const { payload, signature, secret } = opts;

  try {
    // Handle "sha256=..." prefix format
    const sig = signature.startsWith("sha256=")
      ? signature.slice(7)
      : signature;

    const expected = createHmac("sha256", secret).update(payload).digest("hex");

    const sigBuffer = Buffer.from(sig, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");

    if (sigBuffer.length !== expectedBuffer.length) return false;

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
