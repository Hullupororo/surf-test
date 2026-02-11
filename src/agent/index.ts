import Anthropic from "@anthropic-ai/sdk";
import type { SimpleGit } from "simple-git";
import type { AppConfig } from "../config/schema.ts";
import type { AgentResult, ProgressCallback } from "../lib/types.ts";
import { agentTools } from "./tools.ts";
import { handleToolCall } from "./tool-handlers.ts";
import type { ToolHandlerDeps } from "./tool-handlers.ts";
import { buildProjectContext, buildSystemPrompt } from "./context.ts";
import { runWithRetry } from "./retry-loop.ts";
import { classifyTask } from "./prompt-modules/classifier.ts";
import { createChildLogger } from "../lib/logger.ts";

const log = createChildLogger("agent");

export interface RunAgentOpts {
  userMessage: string;
  repoPath: string;
  git: SimpleGit;
  config: AppConfig;
  onProgress: ProgressCallback;
}

export async function runAgent(opts: RunAgentOpts): Promise<AgentResult> {
  const { userMessage, repoPath, git, config, onProgress } = opts;

  return runWithRetry({
    userMessage,
    maxRetries: config.agent.maxRetries,
    onProgress,
    agentFn: async ({
      userMessage: msg,
      errorContext,
      attempt,
      onProgress: progress,
    }) => {
      return executeAgentLoop({
        userMessage: msg,
        errorContext,
        attempt,
        repoPath,
        git,
        config,
        onProgress: progress,
      });
    },
  });
}

async function executeAgentLoop(opts: {
  userMessage: string;
  errorContext?: string;
  attempt: number;
  repoPath: string;
  git: SimpleGit;
  config: AppConfig;
  onProgress: ProgressCallback;
}): Promise<AgentResult> {
  const {
    userMessage,
    errorContext,
    attempt,
    repoPath,
    git,
    config,
    onProgress,
  } = opts;

  const client = new Anthropic({ apiKey: config.anthropic.apiKey });
  const context = await buildProjectContext(repoPath);
  const modules = classifyTask(userMessage);
  const additionalModules = modules.map((m) => m.prompt);
  log.info({ modules: modules.map((m) => m.name) }, "Classified task modules");
  const systemPrompt = buildSystemPrompt({ context, additionalModules });

  let userContent = userMessage;
  if (errorContext && attempt > 1) {
    userContent = `${userMessage}\n\n[Previous attempt failed with: ${errorContext}]\nPlease fix the issue and try again.`;
  }

  const deps: ToolHandlerDeps = { repoPath, git, onProgress };

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userContent },
  ];

  const filesChanged = new Set<string>();
  let commitHash: string | null = null;
  const maxTurns = 50;

  for (let turn = 0; turn < maxTurns; turn++) {
    log.info({ turn, attempt }, "Agent turn");

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8192,
      system: systemPrompt,
      tools: agentTools,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      const summary =
        textBlock?.type === "text" ? textBlock.text : "Changes applied";

      return {
        success: true,
        summary,
        filesChanged: [...filesChanged],
        commitHash,
        screenshotPath: null,
      };
    }

    if (response.stop_reason === "tool_use") {
      const toolBlocks = response.content.filter((b) => b.type === "tool_use");

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolBlocks) {
        if (block.type !== "tool_use") continue;

        log.info({ tool: block.name }, "Executing tool");

        const result = await handleToolCall({
          name: block.name,
          input: block.input as Record<string, unknown>,
          deps,
        });

        if (block.name === "write_file" || block.name === "edit_file") {
          const path = (block.input as Record<string, unknown>)[
            "path"
          ] as string;
          filesChanged.add(path);
        }

        if (block.name === "git_commit" && !result.isError) {
          const match = result.content.match(/Committed: (.+)/);
          if (match?.[1]) commitHash = match[1];
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.content,
          is_error: result.isError ?? false,
        });
      }

      messages.push({ role: "user", content: toolResults });
    } else {
      log.warn({ stopReason: response.stop_reason }, "Unexpected stop reason");
      break;
    }
  }

  return {
    success: false,
    summary: "Agent reached maximum turns without completing",
    filesChanged: [...filesChanged],
    commitHash,
    screenshotPath: null,
  };
}
