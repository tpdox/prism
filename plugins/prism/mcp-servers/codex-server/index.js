#!/usr/bin/env node

/**
 * Prism Codex MCP Server
 *
 * Thin passthrough to `codex mcp-server`. Codex has built-in MCP support,
 * so this wrapper simply spawns it and pipes stdio through. The wrapper
 * exists so the plugin's .mcp.json can reference a stable path and so we
 * can inject environment variables or configuration in the future.
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";

// Locate codex binary — prefer PATH, fall back to Homebrew location
const CODEX_BIN = process.env.CODEX_PATH || "codex";

const child = spawn(CODEX_BIN, ["mcp-server"], {
  stdio: ["pipe", "pipe", "inherit"], // inherit stderr for debug logs
  env: {
    ...process.env,
    // Forward any Prism-specific config
    PRISM_CODEX_WRAPPER: "true",
  },
});

// Pipe stdin/stdout bidirectionally (MCP stdio transport)
process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);

child.on("error", (err) => {
  process.stderr.write(`[prism-codex] Failed to start codex: ${err.message}\n`);
  process.stderr.write(`[prism-codex] Make sure Codex CLI is installed: npm install -g @openai/codex\n`);
  process.exit(1);
});

child.on("close", (code) => {
  process.exit(code ?? 0);
});

// Forward signals
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
