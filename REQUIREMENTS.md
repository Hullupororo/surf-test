# Requirements: Telegram Bot Developer

## Technical Stack

| Component | Technology | Rationale |
|---|---|---|
| Runtime | Bun / Node.js | Fast, TypeScript-native |
| Language | TypeScript | Type safety, args-as-object convention |
| Telegram SDK | grammY or node-telegram-bot-api | Mature, well-documented |
| AI Engine | Claude API (Anthropic SDK) | Tool use, code generation |
| Git | simple-git (npm) | Programmatic git operations |
| Task Queue | BullMQ + Redis (or in-memory for v1) | Sequential task processing |
| Deployment | Platform webhooks (Vercel/Netlify API) | Push-triggered deploys |
| Server Framework | Hono or Fastify | Lightweight, webhook endpoints |
| Browser MCP | @playwright/mcp | Visual verification of changes via headless browser |
| MCP SDK | @modelcontextprotocol/sdk | MCP client for connecting to Playwright MCP server |

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
- R1.6: Bot must send final result with summary of changes made
- R1.7: Bot must handle errors gracefully and report them in user-friendly language

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
- R4.5: Push changes to remote after successful commit
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
  - Custom webhook (generic POST)
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
      generic.ts        # Generic webhook adapter
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
- R6.3: Task history persisted to SQLite (or JSON file for v1)
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
```

---

## Development Phases (Ralph Loop)

Each phase is implemented using Ralph Loop with a specific prompt and completion promise.

### Phase 1: Project Scaffold
```
/ralph-loop "Set up the project: package.json, tsconfig, directory structure as defined in REQUIREMENTS.md. Install dependencies. Output <promise>SCAFFOLD COMPLETE</promise> when done." --completion-promise "SCAFFOLD COMPLETE" --max-iterations 5
```

### Phase 2: Telegram Bot Gateway
```
/ralph-loop "Implement Module 1 (Telegram Bot Gateway) per REQUIREMENTS.md. Bot should start, respond to messages, and handle commands. Include auth middleware. Write tests. Output <promise>BOT GATEWAY COMPLETE</promise> when all tests pass." --completion-promise "BOT GATEWAY COMPLETE" --max-iterations 15
```

### Phase 3: Git Manager
```
/ralph-loop "Implement Module 4 (Git Manager) per REQUIREMENTS.md. Clone, pull, commit, push, rollback. Write tests with a test repo. Output <promise>GIT MANAGER COMPLETE</promise> when all tests pass." --completion-promise "GIT MANAGER COMPLETE" --max-iterations 15
```

### Phase 4: Claude Agent
```
/ralph-loop "Implement Module 3 (Claude Agent) per REQUIREMENTS.md. Agent receives user message, reads files, makes changes, runs build, commits. Wire up tools. Write tests. Output <promise>AGENT COMPLETE</promise> when all tests pass." --completion-promise "AGENT COMPLETE" --max-iterations 20
```

### Phase 5: Task Queue & Orchestrator
```
/ralph-loop "Implement Module 2 (Task Queue) per REQUIREMENTS.md. Queue tasks, execute sequentially, manage lifecycle. Wire bot -> queue -> agent -> git. Write tests. Output <promise>QUEUE COMPLETE</promise> when all tests pass." --completion-promise "QUEUE COMPLETE" --max-iterations 15
```

### Phase 6: Deploy & Webhooks
```
/ralph-loop "Implement Module 5 (Deploy & Webhooks) per REQUIREMENTS.md. Trigger deploys, receive webhooks, notify via Telegram. Write tests. Output <promise>DEPLOY COMPLETE</promise> when all tests pass." --completion-promise "DEPLOY COMPLETE" --max-iterations 15
```

### Phase 7: Playwright MCP & Visual Verification
```
/ralph-loop "Implement the Playwright MCP integration in src/agent/mcp/. Agent must start a dev server, connect to Playwright MCP in headless mode, navigate to localhost, take snapshots and screenshots, check console errors. Wire browser tools into the agent tool loop. Write tests. Output <promise>BROWSER MCP COMPLETE</promise> when tests pass." --completion-promise "BROWSER MCP COMPLETE" --max-iterations 15
```

### Phase 8: Integration & E2E
```
/ralph-loop "Wire all modules together. Full flow: Telegram message -> queue -> agent -> git -> build -> browser verify -> deploy -> webhook -> Telegram notification with screenshot. Write E2E test. Output <promise>INTEGRATION COMPLETE</promise> when E2E test passes." --completion-promise "INTEGRATION COMPLETE" --max-iterations 20
```

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
| Unit | Vitest / Bun test | Individual modules (git ops, formatters, parsers) |
| Integration | Vitest | Module interactions (bot -> queue -> agent) |
| Visual | Playwright MCP | Agent verifies changes in headless browser after each task |
| E2E | Custom script | Full flow with mock Telegram and mock deploy |

---

## File Structure (Complete)

```
telegram-bot-developer/
  src/
    bot/
      index.ts
      handlers.ts
      auth.ts
      formatter.ts
    queue/
      index.ts
      task.ts
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
        generic.ts
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
  PRD.md
  REQUIREMENTS.md
  PROMPT.md                # Ralph Loop master prompt
```
