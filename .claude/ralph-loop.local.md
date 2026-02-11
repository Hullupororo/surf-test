---
active: true
iteration: 1
max_iterations: 20
completion_promise: "AGENT COMPLETE"
started_at: "2026-02-11T16:05:16Z"
---

Implement Module 3 (Claude Agent) per REQUIREMENTS.md. This is the core code engine. Implement: src/agent/tools.ts (tool definitions for Claude API tools[] array), src/agent/tool-handlers.ts (tool execution: read_file, write_file, edit_file, run_bash, search_files, glob_files, git_diff, git_commit, project_map, detect_conventions, web_fetch, report_progress), src/agent/context.ts (project context builder), src/agent/retry-loop.ts (internal retry on build failure, max 3 retries), src/agent/index.ts (main agentic loop using Anthropic SDK with tool use). Write tests in tests/agent/. All tests must pass. Output <promise>AGENT COMPLETE</promise> when all tests pass.
