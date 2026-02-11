import type Anthropic from "@anthropic-ai/sdk";

type Tool = Anthropic.Tool;

export const agentTools: Tool[] = [
  {
    name: "read_file",
    description: "Read the contents of a file at the given path",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Absolute or relative file path" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file, creating it if it doesn't exist",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path to write to" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Replace an exact string in a file with new content. The old_string must be unique in the file.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path to edit" },
        old_string: {
          type: "string",
          description: "Exact string to find and replace",
        },
        new_string: { type: "string", description: "Replacement string" },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "run_bash",
    description:
      "Execute a shell command and return stdout/stderr. Use for build, test, lint, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "Shell command to execute" },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds (default: 30000)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "search_files",
    description: "Search for a regex pattern across files in the project",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        glob: {
          type: "string",
          description: "Optional glob to filter files (e.g. '*.ts')",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "glob_files",
    description: "Find files matching a glob pattern",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern (e.g. 'src/**/*.ts')",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "git_diff",
    description: "Show uncommitted changes (git diff)",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "git_commit",
    description: "Stage all changes and commit with the given message",
    input_schema: {
      type: "object" as const,
      properties: {
        message: { type: "string", description: "Commit message" },
      },
      required: ["message"],
    },
  },
  {
    name: "project_map",
    description: "Get the project file structure and key config files summary",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "detect_conventions",
    description:
      "Read project config files (eslint, prettier, tsconfig, package.json) and return a conventions summary",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "report_progress",
    description: "Send a progress update message to the user via Telegram",
    input_schema: {
      type: "object" as const,
      properties: {
        message: { type: "string", description: "Progress message to send" },
      },
      required: ["message"],
    },
  },
];
