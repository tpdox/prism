#!/usr/bin/env node

/**
 * Prism Kimi MCP Server
 *
 * Wraps the Kimi (Moonshot AI) API via its OpenAI-compatible endpoint.
 * Exposes three tools:
 *   - kimi_write:    Long-form writing, documentation, prose (Kimi's strength)
 *   - kimi_generate: General-purpose generation and coding
 *   - kimi_analyze:  Analysis leveraging Kimi's 256K context window
 *
 * Requires MOONSHOT_API_KEY environment variable.
 */

import { bootstrap } from "../shared/bootstrap.js";
bootstrap(import.meta.url);

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.MOONSHOT_API_BASE || "https://api.moonshot.ai/v1";
const API_KEY = process.env.MOONSHOT_API_KEY;
const DEFAULT_MODEL = process.env.KIMI_MODEL || "kimi-k2.5";

async function callKimi(messages, { model = DEFAULT_MODEL, temperature, maxTokens } = {}) {
  if (!API_KEY) {
    throw new Error(
      "MOONSHOT_API_KEY not set. Get one at https://platform.moonshot.ai/"
    );
  }

  const body = {
    model,
    messages,
    stream: false,
  };
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;

  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kimi API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? JSON.stringify(data);
}

const server = new McpServer({
  name: "prism-kimi",
  version: "1.0.0",
});

server.tool(
  "kimi_write",
  "Write polished prose, documentation, or long-form content using Kimi. Kimi excels at natural, well-structured writing with strong narrative flow.",
  {
    prompt: z.string().describe("Writing prompt — describe what to write, the audience, tone, and any constraints"),
    context: z.string().optional().describe("Reference material, outlines, or source content to inform the writing"),
    model: z.string().optional().describe("Kimi model (default: kimi-k2.5)"),
    temperature: z.number().min(0).max(1).optional().describe("Creativity level 0-1 (default: 0.7 for writing)"),
  },
  async ({ prompt, context, model, temperature }) => {
    try {
      const systemMsg = {
        role: "system",
        content:
          "You are an expert writer. Produce polished, well-structured content. " +
          "Focus on clarity, natural flow, and strong prose. " +
          "Match the requested tone and format precisely.",
      };
      const userContent = context
        ? `${prompt}\n\n--- Reference Material ---\n${context}`
        : prompt;

      const result = await callKimi(
        [systemMsg, { role: "user", content: userContent }],
        { model, temperature: temperature ?? 0.7 }
      );
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "kimi_generate",
  "General-purpose text and code generation using Kimi. Supports Kimi's 256K context window for large inputs.",
  {
    prompt: z.string().describe("The prompt to send to Kimi"),
    system: z.string().optional().describe("Optional system message to set behavior"),
    model: z.string().optional().describe("Kimi model (default: kimi-k2.5)"),
    temperature: z.number().min(0).max(1).optional().describe("Temperature 0-1"),
  },
  async ({ prompt, system, model, temperature }) => {
    try {
      const messages = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: prompt });

      const result = await callKimi(messages, { model, temperature });
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "kimi_analyze",
  "Analyze large amounts of text, code, or data using Kimi's 256K context window. Good for codebase analysis, document review, and comparative analysis.",
  {
    prompt: z.string().describe("Analysis prompt — what to analyze and what questions to answer"),
    context: z.string().optional().describe("Content to analyze (code, documents, data)"),
    model: z.string().optional().describe("Kimi model (default: kimi-k2.5)"),
  },
  async ({ prompt, context, model }) => {
    try {
      const userContent = context
        ? `${prompt}\n\n--- Content to Analyze ---\n${context}`
        : prompt;

      const result = await callKimi(
        [{ role: "user", content: userContent }],
        { model, temperature: 0.3 }
      );
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
