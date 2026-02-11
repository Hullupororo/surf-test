import { createChildLogger } from "../lib/logger.ts";

const log = createChildLogger("webhook:parser");

export type BuildStatus = "success" | "failure" | "building" | "unknown";

export interface ParsedWebhook {
  platform: string;
  deployId: string;
  status: BuildStatus;
  url: string | null;
  error: string | null;
  commitHash: string | null;
  raw: Record<string, unknown>;
}

export function parseVercelWebhook(
  payload: Record<string, unknown>,
): ParsedWebhook {
  const type = payload["type"] as string | undefined;
  const deployPayload = payload["payload"] as
    | Record<string, unknown>
    | undefined;
  const deployment = deployPayload?.["deployment"] as
    | Record<string, unknown>
    | undefined;

  let status: BuildStatus = "unknown";
  if (type === "deployment.succeeded" || type === "deployment-ready") {
    status = "success";
  } else if (type === "deployment.error" || type === "deployment-error") {
    status = "failure";
  } else if (type === "deployment.created" || type === "deployment") {
    status = "building";
  }

  const url = (deployment?.["url"] as string) ?? null;
  const meta = deployment?.["meta"] as Record<string, unknown> | undefined;
  const commitHash =
    (meta?.["githubCommitSha"] as string) ??
    (meta?.["gitlabCommitSha"] as string) ??
    null;

  log.info(
    { type, status, deployId: deployment?.["id"] },
    "Parsed Vercel webhook",
  );

  return {
    platform: "vercel",
    deployId: (deployment?.["id"] as string) ?? "unknown",
    status,
    url: url ? `https://${url}` : null,
    error:
      status === "failure"
        ? ((deployPayload?.["error"] as string) ?? "Build failed")
        : null,
    commitHash,
    raw: payload,
  };
}

export function parseNetlifyWebhook(
  payload: Record<string, unknown>,
): ParsedWebhook {
  const state = payload["state"] as string | undefined;

  let status: BuildStatus = "unknown";
  if (state === "ready") {
    status = "success";
  } else if (state === "error") {
    status = "failure";
  } else if (state === "building" || state === "enqueued") {
    status = "building";
  }

  const url =
    (payload["ssl_url"] as string) ?? (payload["url"] as string) ?? null;
  const commitRef = (payload["commit_ref"] as string | null) ?? null;

  log.info(
    { state, status, deployId: payload["id"] },
    "Parsed Netlify webhook",
  );

  return {
    platform: "netlify",
    deployId: (payload["id"] as string) ?? "unknown",
    status,
    url,
    error:
      status === "failure"
        ? ((payload["error_message"] as string) ?? "Build failed")
        : null,
    commitHash: commitRef,
    raw: payload,
  };
}

export function parseCustomWebhook(
  payload: Record<string, unknown>,
): ParsedWebhook {
  const status = (payload["status"] as BuildStatus) ?? "unknown";
  const url = (payload["url"] as string) ?? null;
  const deployId =
    (payload["deploy_id"] as string) ?? (payload["id"] as string) ?? "unknown";
  const commitHash = (payload["commit_hash"] as string) ?? null;
  const error = (payload["error"] as string) ?? null;

  log.info({ status, deployId }, "Parsed custom webhook");

  return {
    platform: "custom",
    deployId,
    status,
    url,
    error: status === "failure" ? (error ?? "Build failed") : null,
    commitHash,
    raw: payload,
  };
}

export function parseWebhook(opts: {
  platform: string;
  payload: Record<string, unknown>;
}): ParsedWebhook {
  switch (opts.platform) {
    case "vercel":
      return parseVercelWebhook(opts.payload);
    case "netlify":
      return parseNetlifyWebhook(opts.payload);
    case "custom":
      return parseCustomWebhook(opts.payload);
    default:
      return {
        platform: opts.platform,
        deployId: "unknown",
        status: "unknown",
        url: null,
        error: null,
        commitHash: null,
        raw: opts.payload,
      };
  }
}
