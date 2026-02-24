#!/usr/bin/env node

/**
 * Prism Gemini MCP Server
 *
 * Custom MCP server that wraps Gemini CLI, exposing three tools:
 *   - gemini_generate: General-purpose text generation
 *   - gemini_analyze:  Analyze files/code with Gemini's large context window
 *   - gemini_research: Web-grounded research via Gemini with Google Search
 */

import { bootstrap } from "../shared/bootstrap.js";
bootstrap(import.meta.url);

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runCli } from "../shared/cli-runner.js";
import { parseGeminiJson } from "../shared/output-parser.js";

const GEMINI_BIN = process.env.GEMINI_PATH || "gemini";

async function callGemini(prompt, { sandbox = true, model } = {}) {
  const args = ["--output-format", "json"];
  if (sandbox) args.push("--sandbox");
  if (model) args.push("--model", model);
  args.push("-p", prompt);

  const { stdout, stderr, code } = await runCli(GEMINI_BIN, args, {
    timeout: 180_000, // 3 min for research tasks
  });

  if (code !== 0) {
    const errMsg = stderr.trim() || `Gemini exited with code ${code}`;
    throw new Error(errMsg);
  }

  return parseGeminiJson(stdout);
}

const server = new McpServer({
  name: "prism-gemini",
  version: "1.0.0",
});

server.tool(
  "gemini_generate",
  "Generate text or code using Gemini. Good for multi-file generation, creative tasks, and leveraging Gemini's large context window.",
  {
    prompt: z.string().describe("The prompt to send to Gemini"),
    model: z.string().optional().describe("Gemini model to use (e.g. gemini-2.5-pro, gemini-2.5-flash)"),
  },
  async ({ prompt, model }) => {
    try {
      const result = await callGemini(prompt, { model });
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "gemini_analyze",
  "Analyze code, files, or data using Gemini's 1M token context window. Ideal for large codebases, complex analysis, and multi-file understanding.",
  {
    prompt: z.string().describe("Analysis prompt — describe what to analyze and any specific questions"),
    context: z.string().optional().describe("Additional context (file contents, code snippets) to include in the analysis"),
    model: z.string().optional().describe("Gemini model to use"),
  },
  async ({ prompt, context, model }) => {
    try {
      const fullPrompt = context
        ? `${prompt}\n\n--- Context ---\n${context}`
        : prompt;
      const result = await callGemini(fullPrompt, { model });
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "gemini_research",
  "Research a topic using Gemini with Google Search grounding. Returns web-sourced information with citations. Best for API docs, library research, and current information.",
  {
    query: z.string().describe("Research query — what to look up"),
    depth: z.enum(["quick", "thorough"]).default("quick").describe("Research depth: 'quick' for brief answers, 'thorough' for comprehensive research"),
    model: z.string().optional().describe("Gemini model to use"),
  },
  async ({ query, depth, model }) => {
    try {
      const depthInstruction = depth === "thorough"
        ? "Provide a comprehensive, detailed analysis with multiple sources and perspectives."
        : "Provide a concise, focused answer.";

      const prompt = `Research the following topic. Use Google Search to find current, accurate information. ${depthInstruction}\n\nTopic: ${query}`;
      const result = await callGemini(prompt, { sandbox: false, model });
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
