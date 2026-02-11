import { frontendExpert } from "./frontend-expert.ts";
import { apiExpert } from "./api-expert.ts";
import { configExpert } from "./config-expert.ts";
import { copyEditor } from "./copy-editor.ts";
import { databaseExpert } from "./database-expert.ts";
import { testingExpert } from "./testing-expert.ts";

export interface PromptModule {
  name: string;
  description: string;
  prompt: string;
}

const allModules: PromptModule[] = [
  frontendExpert,
  apiExpert,
  configExpert,
  copyEditor,
  databaseExpert,
  testingExpert,
];

const KEYWORD_MAP: Record<string, string[]> = {
  "frontend-expert": [
    "css",
    "html",
    "style",
    "layout",
    "responsive",
    "component",
    "ui",
    "button",
    "form",
    "modal",
    "header",
    "footer",
    "sidebar",
    "navbar",
    "animation",
    "transition",
    "color",
    "font",
    "design",
    "page",
    "view",
    "react",
    "vue",
    "svelte",
    "tailwind",
    "flex",
    "grid",
    "margin",
    "padding",
    "border",
    "hover",
    "dark mode",
    "theme",
    "icon",
  ],
  "api-expert": [
    "api",
    "endpoint",
    "route",
    "request",
    "response",
    "rest",
    "graphql",
    "middleware",
    "auth",
    "token",
    "cors",
    "rate limit",
    "webhook",
    "server",
    "http",
    "post",
    "get",
    "put",
    "delete",
    "patch",
    "status code",
    "json",
    "payload",
    "backend",
  ],
  "config-expert": [
    "config",
    "tsconfig",
    "package.json",
    "webpack",
    "vite",
    "eslint",
    "prettier",
    "build",
    "deploy",
    "ci",
    "cd",
    "docker",
    "env",
    "environment",
    "script",
    "dependency",
    "install",
    "npm",
    "yarn",
    "pnpm",
    "bun",
    "next.config",
    "babel",
  ],
  "copy-editor": [
    "text",
    "copy",
    "content",
    "wording",
    "typo",
    "spelling",
    "grammar",
    "translation",
    "i18n",
    "localization",
    "string",
    "message",
    "label",
    "title",
    "description",
    "placeholder",
    "tooltip",
    "readme",
    "documentation",
    "docs",
  ],
  "database-expert": [
    "database",
    "db",
    "sql",
    "sqlite",
    "postgres",
    "mysql",
    "migration",
    "schema",
    "table",
    "column",
    "index",
    "query",
    "join",
    "insert",
    "update",
    "delete",
    "foreign key",
    "constraint",
    "orm",
    "prisma",
    "drizzle",
    "knex",
  ],
  "testing-expert": [
    "test",
    "spec",
    "jest",
    "vitest",
    "mocha",
    "assert",
    "expect",
    "mock",
    "stub",
    "spy",
    "coverage",
    "e2e",
    "integration test",
    "unit test",
    "fixture",
    "snapshot",
  ],
};

export function classifyTask(userMessage: string): PromptModule[] {
  const lower = userMessage.toLowerCase();
  const matched = new Set<string>();

  for (const [moduleName, keywords] of Object.entries(KEYWORD_MAP)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        matched.add(moduleName);
        break;
      }
    }
  }

  // If nothing matched, default to frontend (most common for website changes)
  if (matched.size === 0) {
    matched.add("frontend-expert");
  }

  return allModules.filter((m) => matched.has(m.name));
}

export function getModuleByName(name: string): PromptModule | undefined {
  return allModules.find((m) => m.name === name);
}

export function getAllModules(): PromptModule[] {
  return [...allModules];
}
