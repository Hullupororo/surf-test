# Initial Prompt: Telegram Bot Developer

Use this prompt to recreate the project from scratch.

---

We need to build a service called **Telegram Bot Developer** — a server that runs a Telegram bot connected to a git repo. Users send natural-language messages in Telegram describing what they want to change on their website, and the bot uses Claude (via the Anthropic API with tool use) to read the codebase, make changes, commit, push, optionally trigger deployment, and report back in the chat.

## Tech Stack (locked, do not offer alternatives)

- **Runtime**: Node.js v24 (native TypeScript via type-stripping — no build step, no tsx/ts-node, no dotenv, no nodemon; use `--env-file`, `--watch` natively)
- **Telegram SDK**: grammY
- **Server**: Hono + @hono/node-server
- **AI**: @anthropic-ai/sdk (Claude with tool use, model: claude-sonnet-4-5-20250929)
- **Git**: simple-git
- **Task queue**: In-memory for v1 (interface-first design so BullMQ can swap in later)
- **Storage**: better-sqlite3 with WAL mode (in-memory fallback if SQLite fails to load)
- **Logging**: pino (+ pino-pretty dev dep)
- **Validation**: zod
- **IDs**: nanoid
- **MCP**: @modelcontextprotocol/sdk + @playwright/mcp for browser verification
- **Testing**: Vitest
- **Package manager**: npm

## Code Quality & Programming Patterns

### Architecture Patterns

- **Factory functions with dependency injection**: All modules export factory functions that accept their dependencies as a single options object. Example: `createBot({ config, storage, queue })`, `createTaskQueue({ taskTimeout })`, `createGitManager(config)`. No classes with `new`, no singletons, no global state.
- **Interface-first design**: Every module boundary is defined by a TypeScript interface before implementation. `Storage`, `DeployAdapter`, `TaskQueue`, `DeployManager` — all interfaces first, implementations second. This enables swapping implementations (e.g., in-memory → Redis queue) without changing consumers.
- **Adapter pattern for external services**: Deploy platforms (Vercel, Netlify, custom) each implement the same `DeployAdapter` interface. Adding a new platform means adding one file, no changes to existing code.
- **State machine for task lifecycle**: Tasks have explicit states (`queued` → `running` → `completed` | `failed`) with a `transitionTask()` function that enforces valid transitions. No ad-hoc status strings.

### Code Conventions

- **Args-as-object**: Functions with more than 2 parameters take a single object argument. This makes call sites self-documenting and avoids positional parameter confusion.
- **`.ts` extensions in all imports**: Required for Node.js ESM + type-stripping. Every import must use `./foo.ts` not `./foo`.
- **Relative imports only**: No path aliases (`@/`, `~/`). Node.js type-stripping doesn't resolve them. Keep imports simple and explicit.
- **`import type` for type-only imports**: Use `import type { Foo } from "./bar.ts"` when importing only types. Required by `verbatimModuleSyntax: true`.
- **Named exports only**: No default exports anywhere. Named exports are more refactor-friendly and grep-able.
- **Explicit return types on public functions**: All exported functions must have explicit return types. Internal helpers can rely on inference.

### Error Handling

- **Custom error hierarchy**: `AppError` base class with `code` property, extended by `TaskError`, `AgentError`, `GitError`, `DeployError`. Each error type has a unique code for programmatic handling.
- **Errors at boundaries, trust internally**: Validate at system boundaries (env vars via zod, webhook payloads, user input). Internal code trusts types — no defensive checks for impossible states.
- **Path sandboxing**: The agent's tool handlers validate all file paths are within the repo directory. Path traversal attempts (`../`) are blocked with `AgentError`.
- **HMAC signature verification**: All incoming deploy webhooks are verified using `crypto.timingSafeEqual` to prevent timing attacks.

### Testing Patterns

- **Unit tests per module**: Each module has its own test file. Tests are colocated by module in `tests/` mirror of `src/` structure.
- **Real filesystem for git/file tests**: Git and file tool tests use real temp directories (`mkdtempSync`), not mocks. This catches real filesystem edge cases.
- **Mock external services**: Telegram bot API, Anthropic API, and deploy hooks are mocked with `vi.fn()`. Never make real API calls in tests.
- **Hono `app.request()` for HTTP tests**: Webhook and server tests use Hono's built-in `app.request()` method — no need for supertest or spinning up a real server.
- **Test the interface, not the implementation**: Tests assert on behavior (return values, side effects) not internal state. This allows refactoring without breaking tests.

### Logging

- **Structured JSON logging with pino**: Every log line is JSON with consistent fields. Use `pino-pretty` only in dev via pipe (`| pino-pretty`).
- **Child loggers per module**: Each module creates its own child logger with a `module` field: `createChildLogger("git")`, `createChildLogger("agent")`. This makes filtering trivial.
- **Log at boundaries**: Log on entry/exit of major operations (task enqueued, agent started, commit made, deploy triggered). Don't log inside tight loops or on every function call.

### What to Avoid

- **No over-engineering**: No abstract base classes, no generic utilities for one-time operations, no premature abstractions. Three similar lines of code is better than a forced abstraction.
- **No backwards-compatibility hacks**: If something is unused, delete it completely. No `_unusedVar`, no `// removed` comments, no re-exports for old names.
- **No unnecessary dependencies**: Node.js v24 eliminates dotenv, tsx/ts-node, and nodemon. Don't add packages for things the runtime handles natively.
- **No classes**: Use factory functions and closures. Classes add ceremony without benefit for this architecture.
- **No build step**: TypeScript is for type-checking only (`tsc --noEmit`). Node.js runs `.ts` files directly.

## Key Architecture Decisions

- Bot supports two modes: **polling** (default, no public URL needed) and **webhook** (registers with Telegram API on startup). Controlled by `BOT_MODE` env var.
- Always push to remote after successful commit, regardless of branch strategy (direct or feature-branch).
- The orchestrator sends final results (formatted summary with files changed, commit hash) AND errors back to Telegram — not just progress updates.
- Graceful shutdown on SIGINT/SIGTERM: stops queue, bot, and server cleanly.
- Auto-create `data/` directory for SQLite on startup.
- Agent has an internal retry loop (programmatic Ralph pattern): on build/test failure, re-invokes itself with error appended to context, up to configurable max retries.
- System prompt modules (frontend-expert, api-expert, config-expert, copy-editor, database-expert, testing-expert) are injected dynamically based on keyword classification of the user's message.
- No `dotenv`, no `tsx`, no `nodemon` — Node.js v24 handles all of this natively.
- `tsconfig.json`: `noEmit: true`, `module: "NodeNext"`, `target: "ES2024"`, `verbatimModuleSyntax: true`, strict mode. TypeScript is for type-checking only.

## Development Approach

1. First, generate a **PRD.md** and **REQUIREMENTS.md** with full module breakdown, file structure, env vars, API endpoints, and development phases.
2. Then implement using the **Ralph Loop plugin** in 8 phases:
   - **Phase 1**: Project scaffold (package.json, tsconfig, dirs, foundational files: logger, errors, types, config with zod validation, storage interface + memory impl, server with /health endpoint)
   - **Phase 2**: Telegram Bot Gateway (auth middleware, message/command handlers, formatter, commands: /status, /history, /rollback, /config)
   - **Phase 3**: Git Manager (clone, pull, branch strategies, commit, push, rollback, all using simple-git)
   - **Phase 4**: Claude Agent (tool definitions matching Anthropic API format, tool handlers with path sandboxing, context builder, retry loop, agent main loop)
   - **Phase 5**: Task Queue & Orchestrator (task state machine, in-memory queue with timeout/cancellation, orchestrator wiring queue → agent → git → telegram)
   - **Phase 6**: Deploy & Webhooks (Vercel/Netlify/custom adapters, webhook payload parser, event-to-task mapper, HMAC signature verification, route wiring into server)
   - **Phase 7**: Playwright MCP, Prompt Modules, Skills (6 prompt modules + keyword classifier, MCP client for Playwright, 5 skills: dev-server, build-runner, deploy-trigger, telegram-reporter, git-ops)
   - **Phase 8**: Integration (SQLite storage implementation, wire classifier into agent, full startup wiring in index.ts with both bot modes, integration tests)
3. Each phase must include tests. Run `npm run typecheck && npm run test` at the end of each phase — all tests must pass before committing.
4. After all phases, verify the bot starts with `node --env-file=.env src/index.ts` and responds to messages.

## File Structure

The deploy custom adapter file is `custom.ts` (not `generic.ts`). Include `src/lib/` for shared utilities. Include `src/queue/types.ts` for queue interfaces. Include `vitest.config.ts` in root. No PROMPT.md file.

```
src/
  lib/
    logger.ts              # Pino logger instance + createChildLogger factory
    errors.ts              # AppError, TaskError, AgentError, GitError, DeployError
    types.ts               # Shared types (TaskStatus, TaskResult, AgentResult)
  bot/
    index.ts               # Bot creation, startPolling(), registerWebhook()
    handlers.ts            # Message and command handlers
    auth.ts                # User ID allowlist middleware
    formatter.ts           # Format task results, errors, history for Telegram
  queue/
    index.ts               # In-memory queue with sequential processing
    task.ts                # Task factory, state machine, transitions
    types.ts               # TaskQueue interface, Task type, TaskStatus enum
    orchestrator.ts        # Task lifecycle: queue → agent → git → push → notify
  agent/
    index.ts               # Agent main loop (Anthropic API tool-use cycle)
    tools.ts               # Tool definitions array for Claude API
    tool-handlers.ts       # Tool execution with path sandboxing
    context.ts             # Project context builder (tree, conventions)
    retry-loop.ts          # Internal retry on build/test failure
    prompt-modules/
      frontend-expert.ts
      api-expert.ts
      config-expert.ts
      copy-editor.ts
      database-expert.ts
      testing-expert.ts
      classifier.ts        # Keyword-based task → module classifier
    mcp/
      index.ts             # Playwright MCP client (connect, disconnect, callTool)
    skills/
      dev-server.ts        # Start/stop dev server with readiness polling
      build-runner.ts      # Synchronous build via execSync
      deploy-trigger.ts    # Trigger deploy via adapter
      telegram-reporter.ts # Send progress/results to Telegram
      git-ops.ts           # commitAndPush, rollback, clean
  git/
    index.ts               # Git manager (init, commitAll, push, diff, clean)
    clone.ts               # Clone or open existing repo
    branch.ts              # Branch strategy (direct / feature-branch)
    rollback.ts            # Revert last commit, clean uncommitted changes
  deploy/
    index.ts               # Deploy manager with adapter factory
    adapters/
      vercel.ts            # Vercel deploy hook adapter
      netlify.ts           # Netlify deploy hook adapter
      custom.ts            # Custom POST webhook adapter
  webhook/
    index.ts               # Webhook route handler with signature verification
    parser.ts              # Platform-specific payload parsers
    mapper.ts              # Map build events to originating tasks
  config/
    index.ts               # Load + validate config from process.env
    schema.ts              # Zod schemas for all config sections
  storage/
    index.ts               # Storage interface definition
    sqlite.ts              # SQLite implementation (WAL mode, prepared statements)
    memory.ts              # In-memory implementation (v1 default fallback)
  server.ts                # Hono app: /health, /webhook/telegram, /webhook/deploy/:platform
  index.ts                 # Entry point: load config, create everything, start server + bot
tests/
  bot/                     # auth, handlers, formatter tests
  queue/                   # task, queue, orchestrator tests
  agent/                   # tools, tool-handlers, context, retry-loop, classifier, mcp, skills tests
  git/                     # git-manager tests (real temp repos)
  deploy/                  # deploy-manager, parser, mapper, webhook tests
  e2e/                     # sqlite-storage, integration tests
.env.example
package.json
tsconfig.json
vitest.config.ts
PRD.md
REQUIREMENTS.md
```

## Environment Variables

```env
TELEGRAM_BOT_TOKEN=         # Telegram bot API token
TELEGRAM_ALLOWED_USERS=     # Comma-separated Telegram user IDs
BOT_MODE=polling            # "polling" (default) | "webhook"
WEBHOOK_URL=                # Required when BOT_MODE=webhook
ANTHROPIC_API_KEY=          # Claude API key
REPO_URL=                   # Git remote URL (https with token or SSH)
REPO_LOCAL_PATH=./repos/default  # Local clone path
REPO_BRANCH_STRATEGY=direct # "direct" | "feature-branch"
DEPLOY_PLATFORM=vercel      # "vercel" | "netlify" | "custom"
DEPLOY_HOOK_URL=            # Deploy trigger URL
DEPLOY_WEBHOOK_SECRET=      # Secret for verifying incoming deploy webhooks
PLAYWRIGHT_MCP_HEADLESS=true
PLAYWRIGHT_MCP_VIEWPORT=1280x720
AGENT_MAX_RETRIES=3
AGENT_TASK_TIMEOUT=300000
AGENT_DEV_SERVER_CMD=npm run dev
AGENT_DEV_SERVER_PORT=3000
PORT=4000                   # HTTP server port
```

Start by creating PRD.md and REQUIREMENTS.md, then proceed with Phase 1 scaffold using Ralph Loop.
