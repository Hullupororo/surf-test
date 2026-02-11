# Requirements: Telegram Bot Developer

## Technical Stack

| Component | Technology | Rationale |
|---|---|---|
| Runtime | Node.js v24 | Native TypeScript (type-stripping), native `--watch`, native `--env-file`, no build step |
| Language | TypeScript | Type safety, args-as-object convention |
| Telegram SDK | grammY | TypeScript-first, middleware pattern, built-in webhook adapters |
| AI Engine | Claude API (@anthropic-ai/sdk) | Tool use, code generation |
| Git | simple-git | Programmatic git operations |
| Task Queue | In-memory (interface-first) | No Redis dep for v1; interface allows BullMQ swap later |
| Deployment | Platform webhooks (Vercel/Netlify API) | Push-triggered deploys |
| Server Framework | Hono + @hono/node-server | Lightweight (~14KB), TypeScript-first, native grammY adapter |
| Browser MCP | @playwright/mcp | Visual verification of changes via headless browser |
| MCP SDK | @modelcontextprotocol/sdk | MCP client for connecting to Playwright MCP server |
| Storage | better-sqlite3 (with in-memory fallback) | SQLite for task history, zero server deps, WAL mode |
| Logging | pino (+ pino-pretty for dev) | Structured JSON logging, child loggers per module |
| Validation | zod | Schema validation for config and API payloads |
| IDs | nanoid | Compact unique task IDs |
| Testing | Vitest | Mature mocking/coverage, TypeScript-native, ESM-first |

---

## Module Breakdown

### Module 1: Telegram Bot Gateway

**Purpose**: Interface between Telegram and the task processing system.

**Requirements**:

- R1.1: Bot must authenticate incoming messages against an allowlist of Telegram user IDs
- R1.2: Bot must acknowledge message receipt within 2 seconds ("Working on it...")
- R1.3: Bot must support text messages as task input
- R1.4: Bot must support the following commands:
  - `/status` — current task status
  - `/history` — last N changes with commit hashes
  - `/rollback` — revert last commit and redeploy
  - `/config` — show/update current repo and deploy config
- R1.5: Bot must send progress updates during long-running tasks (e.g., "Reading files...", "Making changes...", "Running build...")
- R1.6: Bot must send final result with summary of changes made (formatted with files changed, commit hash, summary)
- R1.7: Bot must handle errors gracefully and report them in user-friendly language
- R1.8: Bot must support two connection modes: `polling` (default, no public URL needed) and `webhook` (requires `WEBHOOK_URL`)
- R1.9: In polling mode, bot deletes any existing webhook and starts long-polling
- R1.10: In webhook mode, bot registers webhook URL with Telegram API automatically on startup

**Files**:
```
src/
  bot/
    index.ts            # Bot initialization and middleware
    handlers.ts         # Message and command handlers
    auth.ts             # User authorization
    formatter.ts        # Message formatting utilities
```

---

### Module 2: Task Queue & Orchestrator

**Purpose**: Queue incoming tasks, ensure sequential execution per repo, manage lifecycle.

**Requirements**:

- R2.1: Each incoming message creates a task in the queue
- R2.2: Tasks for the same repo execute sequentially (no concurrent git modifications)
- R2.3: Each task has states: `queued` → `running` → `completed` | `failed`
- R2.4: Task timeout: configurable, default 5 minutes
- R2.5: On failure, uncommitted changes are cleaned up (`git checkout -- .` + `git clean -fd`)
- R2.6: Task results are persisted for `/history` lookups
- R2.7: Support for task cancellation via Telegram command

**Files**:
```
src/
  queue/
    index.ts            # Queue setup and worker
    task.ts             # Task model and state machine
    orchestrator.ts     # Task lifecycle management
```

---

### Module 3: Claude Agent (Code Engine)

**Purpose**: Receive a user request, understand the codebase, make changes, validate — including visual verification via browser MCP.

**Requirements**:

#### Core Agent

- R3.1: Agent receives: user message, repo path, project context (tech stack, structure hints)
- R3.2: Agent has tool access:
  - **File tools**: read, write, edit (with exact-match replace)
  - **Bash execution**: for build, test, lint, dev server management
  - **Search tools**: grep / glob for code search
  - **Git operations**: stage, commit, diff
  - **Project map**: tree/structure tool returning file layout + key files summary
  - **Diff preview**: `git diff` as structured tool output before committing
  - **Web fetch**: fetch and analyze URLs (e.g., user links a reference site)
  - **Convention detector**: reads config files (eslint, prettier, tsconfig, package.json) and returns structured conventions summary
- R3.3: Agent must read relevant files before modifying them
- R3.4: Agent must run build/lint after making changes to validate correctness
- R3.5: Agent generates a descriptive commit message summarizing changes
- R3.6: Agent returns a structured result: `{ success, summary, filesChanged, commitHash }`
- R3.7: Agent must send progress updates via callback (piped to Telegram)
- R3.8: Agent must respect project conventions (detected from existing code or config)

#### Internal Retry Loop (Ralph Pattern)

- R3.9: If build/test fails, the agent re-invokes itself with the error output appended to context
- R3.10: Maximum retry attempts: configurable, default 3
- R3.11: Each retry iteration sees: original request + previous changes + error output
- R3.12: If all retries exhausted, rollback changes and report failure with error details

This is the programmatic equivalent of Ralph Loop — same prompt, self-referential through accumulated context, but implemented as an internal retry loop in the orchestrator rather than a CLI plugin.

#### MCP-Based Browser Testing (Visual Verification)

- R3.13: After code changes pass build, agent starts a local dev server (`npm run dev` / `bun dev`)
- R3.14: Agent uses a browser MCP server to navigate to the running dev server and verify changes visually
- R3.15: Browser MCP provides these capabilities to the agent:
  - Navigate to URLs (localhost dev server)
  - Take accessibility snapshots (structured DOM tree — primary verification method)
  - Take screenshots (visual evidence for user)
  - Click, type, interact with elements (test interactive changes)
  - Read console errors (catch runtime issues the build didn't catch)
  - Check network requests (verify API calls work)
- R3.16: Agent must verify that requested changes are actually visible/functional on the page
- R3.17: If visual verification fails, agent enters retry loop to fix
- R3.18: Screenshots are sent back to user in Telegram as proof of changes
- R3.19: Dev server must be cleaned up (killed) after verification completes

**Browser MCP**: Playwright MCP (`@playwright/mcp`)

- Free, no external dependencies, 27k GitHub stars
- Uses accessibility snapshots — no vision model needed, LLM-friendly structured data
- Supports headless mode via `--headless` (default for our agent)
- Can run in Docker for production deployments
- Programmatic usage via `createConnection()` from `@playwright/mcp`

#### System Prompt Modules (Dynamic Skills)

Since the agent runs via the Anthropic API (not Claude Code CLI), "skills" are implemented as **system prompt modules** — reusable instruction blocks injected into the agent's system prompt based on task analysis.

| Module | Injected When | Contains |
|---|---|---|
| `frontend-expert` | Changes involve UI, CSS, components, layouts | Framework-specific patterns (React/Vue/Svelte), CSS best practices, component structure conventions |
| `api-expert` | Changes involve backend routes, APIs, middleware | REST/GraphQL patterns, error handling, auth middleware, validation |
| `config-expert` | Changes involve build config, env vars, CI/CD | Build tool specifics (Vite/Webpack/Turbopack), env management, deployment config |
| `copy-editor` | Changes are text/content only | Markdown conventions, i18n patterns, content structure |
| `database-expert` | Changes involve schema, queries, migrations | ORM patterns, migration safety, query optimization |
| `testing-expert` | User specifically requests tests | Testing patterns, mock strategies, coverage expectations |

Module selection is automatic: the orchestrator analyzes the user's message with a lightweight Claude call to classify the task type, then injects the relevant modules.

**Agent Tools (Claude API `tools[]`)**:

| Tool | Purpose | Implementation |
|---|---|---|
| `read_file` | Read file contents | fs.readFile with path validation |
| `write_file` | Write/create file | fs.writeFile with path validation |
| `edit_file` | Exact string replacement in file | Find-and-replace with uniqueness check |
| `run_bash` | Execute shell command | child_process.exec with timeout + cwd lock |
| `search_files` | Grep for pattern across codebase | ripgrep or native grep wrapper |
| `glob_files` | Find files by pattern | glob with path filtering |
| `git_diff` | Preview uncommitted changes | simple-git diff output |
| `git_commit` | Stage and commit changes | simple-git add + commit |
| `project_map` | Get project structure + key files | Tree + config file summary |
| `detect_conventions` | Read config files, return conventions | Parse eslint/prettier/tsconfig/package.json |
| `web_fetch` | Fetch and extract content from URL | HTTP fetch + HTML-to-markdown |
| `report_progress` | Send status update to Telegram | Callback to bot instance |
| `browser_navigate` | Navigate browser to URL | MCP: browser_navigate |
| `browser_snapshot` | Get accessibility snapshot of page | MCP: browser_snapshot |
| `browser_screenshot` | Take screenshot of current page | MCP: browser_take_screenshot |
| `browser_click` | Click element on page | MCP: browser_click |
| `browser_type` | Type text into element | MCP: browser_type |
| `browser_console` | Get console messages/errors | MCP: browser_console_messages |
| `browser_network` | List network requests | MCP: browser_network_requests |

**Files**:
```
src/
  agent/
    index.ts              # Agent initialization and main loop
    tools.ts              # Tool definitions for Claude API
    tool-handlers.ts      # Tool execution implementations
    context.ts            # Project context builder
    retry-loop.ts         # Internal retry loop (Ralph pattern)
    prompt-modules/
      frontend-expert.ts  # Frontend system prompt module
      api-expert.ts       # API/backend system prompt module
      config-expert.ts    # Config/build system prompt module
      copy-editor.ts      # Content/copy system prompt module
      database-expert.ts  # Database system prompt module
      testing-expert.ts   # Testing system prompt module
      classifier.ts       # Task type classifier (picks modules)
    mcp/
      index.ts            # MCP client manager (Playwright MCP connection)
    skills/
      git-ops.ts          # Git operations skill
      deploy-trigger.ts   # Deployment trigger skill
      telegram-reporter.ts  # Progress reporting skill
      build-runner.ts     # Build/test runner skill
      dev-server.ts       # Dev server lifecycle (start/stop)
```

---

### Module 4: Git Manager

**Purpose**: Manage the local repo clone, branches, commits, pushes.

**Requirements**:

- R4.1: Maintain a local clone of the configured remote repo
- R4.2: Pull latest changes before starting any task
- R4.3: Support branch strategies:
  - `direct`: commit directly to main/master
  - `feature-branch`: create branch per task, push, optionally auto-merge
- R4.4: Generate commit messages from Claude's summary
- R4.5: Always push changes to remote after successful commit (regardless of branch strategy)
- R4.6: Support rollback: revert last commit and force-push
- R4.7: Handle merge conflicts by notifying user (no auto-resolve in v1)

**Files**:
```
src/
  git/
    index.ts            # Git manager class
    clone.ts            # Repo cloning and setup
    branch.ts           # Branch strategy logic
    rollback.ts         # Rollback operations
```

---

### Module 5: Deploy & Webhook Manager

**Purpose**: Trigger deployments and receive build status callbacks.

**Requirements**:

- R5.1: Trigger deployment after successful git push
- R5.2: Support deployment platforms via adapter pattern:
  - Vercel (deploy hook or API)
  - Netlify (build hook or API)
  - Custom webhook (custom POST)
- R5.3: Expose webhook endpoint to receive CI/CD callbacks
- R5.4: Parse build status from webhook payload (platform-specific adapters)
- R5.5: Map build events back to originating task/Telegram conversation
- R5.6: Send build success/failure notification to Telegram with:
  - Deploy URL (on success)
  - Error summary (on failure)
- R5.7: Webhook endpoint must validate incoming requests (signature verification)

**Files**:
```
src/
  deploy/
    index.ts            # Deploy manager
    adapters/
      vercel.ts         # Vercel deploy adapter
      netlify.ts        # Netlify deploy adapter
      custom.ts         # Custom webhook adapter
  webhook/
    index.ts            # Webhook HTTP server
    parser.ts           # Platform-specific payload parsers
    mapper.ts           # Map build events to tasks
```

---

### Module 6: Configuration & Storage

**Purpose**: Store project config, task history, user settings.

**Requirements**:

- R6.1: Configuration stored in a config file (`.telegram-bot-dev.config.ts` or env vars)
- R6.2: Config includes:
  - Telegram bot token
  - Allowed user IDs
  - Repo URL and local path
  - Branch strategy
  - Deploy platform and credentials
  - Claude API key
- R6.3: Task history persisted to SQLite (WAL mode, with in-memory fallback)
- R6.4: Each task record: `{ id, userMessage, status, summary, filesChanged, commitHash, timestamp }`

**Files**:
```
src/
  config/
    index.ts            # Config loader and validator
    schema.ts           # Config type definitions
  storage/
    index.ts            # Storage interface
    sqlite.ts           # SQLite implementation
    memory.ts           # In-memory fallback
```

---

## API / Webhook Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/webhook/telegram` | Telegram bot webhook (incoming messages) |
| POST | `/webhook/deploy/:platform` | CI/CD build status callbacks |
| GET | `/health` | Health check |

---

## Environment Variables

```env
TELEGRAM_BOT_TOKEN=         # Telegram bot API token
TELEGRAM_ALLOWED_USERS=     # Comma-separated Telegram user IDs
BOT_MODE=                   # "polling" (default) | "webhook"
WEBHOOK_URL=                # Required when BOT_MODE=webhook
ANTHROPIC_API_KEY=          # Claude API key
REPO_URL=                   # Git remote URL
REPO_LOCAL_PATH=            # Local clone path
REPO_BRANCH_STRATEGY=       # "direct" | "feature-branch"
DEPLOY_PLATFORM=            # "vercel" | "netlify" | "custom"
DEPLOY_HOOK_URL=            # Deploy trigger URL
DEPLOY_WEBHOOK_SECRET=      # Secret for verifying incoming deploy webhooks

# Playwright MCP Configuration
PLAYWRIGHT_MCP_HEADLESS=    # true (default) | false
PLAYWRIGHT_MCP_VIEWPORT=    # "1280x720" (default)

# Agent Configuration
AGENT_MAX_RETRIES=          # Max retry attempts on failure (default: 3)
AGENT_TASK_TIMEOUT=         # Task timeout in ms (default: 300000)
AGENT_DEV_SERVER_CMD=       # Dev server command (default: "npm run dev")
AGENT_DEV_SERVER_PORT=      # Dev server port (default: 3000)

# Server
PORT=                       # HTTP server port (default: 4000)
```

---

## Development Phases (Ralph Loop) — All Complete

Each phase was implemented using Ralph Loop with iterative refinement. All 8 phases are complete with 164 tests passing across 20 test files.

| Phase | Module | Status | Tests |
|---|---|---|---|
| 1 | Project Scaffold | Done | — |
| 2 | Telegram Bot Gateway | Done | bot/ (auth, handlers, formatter) |
| 3 | Git Manager | Done | git/ (clone, branch, rollback, manager) |
| 4 | Claude Agent | Done | agent/ (tools, tool-handlers, context, retry-loop) |
| 5 | Task Queue & Orchestrator | Done | queue/ (task, queue, orchestrator) |
| 6 | Deploy & Webhooks | Done | deploy/ + webhook/ (adapters, parser, mapper, routes) |
| 7 | Playwright MCP, Prompt Modules, Skills | Done | agent/ (classifier, mcp, skills) |
| 8 | Integration & E2E | Done | e2e/ (sqlite storage, integration) |

Post-implementation fixes applied:
- Added polling/webhook bot modes
- Fixed always-push behavior (was feature-branch only)
- Added final result/error messaging back to Telegram
- Added graceful shutdown (SIGINT/SIGTERM)
- Auto-create `data/` directory for SQLite

---

## Security Considerations

- **Authentication**: Only pre-approved Telegram user IDs can interact with the bot
- **API Keys**: All secrets via environment variables, never committed
- **Git**: SSH key or token-based auth for push operations
- **Webhooks**: Signature verification on all incoming webhooks
- **Claude Sandbox**: Agent bash access limited to project directory (no system-wide commands)
- **Rate Limiting**: Max N tasks per user per hour to prevent abuse

---

## Testing Strategy

| Level | Tool | Scope |
|---|---|---|
| Unit | Vitest | Individual modules (git ops, formatters, parsers) |
| Integration | Vitest | Module interactions (bot -> queue -> agent) |
| Visual | Playwright MCP | Agent verifies changes in headless browser after each task |
| E2E | Vitest | Full flow with mock Telegram and mock deploy |

---

## File Structure (Complete)

```
telegram-bot-developer/
  src/
    lib/
      logger.ts            # Pino logger with child logger factory
      errors.ts            # AppError base class, TaskError, AgentError, GitError subtypes
      types.ts             # Shared types (TaskStatus, TaskResult, AgentResult)
    bot/
      index.ts
      handlers.ts
      auth.ts
      formatter.ts
    queue/
      index.ts
      task.ts
      types.ts             # TaskQueue interface, Task type, TaskStatus enum
      orchestrator.ts
    agent/
      index.ts
      tools.ts
      tool-handlers.ts
      context.ts
      retry-loop.ts
      prompt-modules/
        frontend-expert.ts
        api-expert.ts
        config-expert.ts
        copy-editor.ts
        database-expert.ts
        testing-expert.ts
        classifier.ts
      mcp/
        index.ts            # Playwright MCP client connection
      skills/
        git-ops.ts
        deploy-trigger.ts
        telegram-reporter.ts
        build-runner.ts
        dev-server.ts
    git/
      index.ts
      clone.ts
      branch.ts
      rollback.ts
    deploy/
      index.ts
      adapters/
        vercel.ts
        netlify.ts
        custom.ts
    webhook/
      index.ts
      parser.ts
      mapper.ts
    config/
      index.ts
      schema.ts
    storage/
      index.ts
      sqlite.ts
      memory.ts
    server.ts              # HTTP server (webhook endpoints)
    index.ts               # Entry point
  tests/
    bot/
    queue/
    agent/
    git/
    deploy/
    e2e/
  .env.example
  package.json
  tsconfig.json
  vitest.config.ts
  PRD.md
  REQUIREMENTS.md
```
