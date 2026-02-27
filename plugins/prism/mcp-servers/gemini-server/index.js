#!/usr/bin/env node

/**
 * Prism Gemini MCP Server
 *
 * Direct API integration with Google Gemini (no CLI dependency).
 * Exposes three tools:
 *   - gemini_generate: General-purpose text generation
 *   - gemini_analyze:  Analyze files/code with Gemini's large context window
 *   - gemini_research: Web-grounded research via Gemini with Google Search
 */

import { bootstrap } from "../shared/bootstrap.js";
bootstrap(import.meta.url);

const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = await import("zod");

const API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

async function callGemini(prompt, { model = DEFAULT_MODEL, systemInstruction, tools } = {}) {
  if (!API_KEY) {
    throw new Error(
      "Neither GOOGLE_API_KEY nor GEMINI_API_KEY is set. Get one at https://aistudio.google.com/apikey"
    );
  }

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (tools) {
    body.tools = tools;
  }

  const url = `${API_BASE}/models/${model}:generateContent?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts?.length) {
    throw new Error(`Gemini returned no content: ${JSON.stringify(data)}`);
  }
  return parts.map((p) => p.text ?? "").join("");
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

      const prompt = `Research the following topic. ${depthInstruction}\n\nTopic: ${query}`;
      // Enable Google Search grounding for research queries
      const result = await callGemini(prompt, {
        model,
        tools: [{ googleSearch: {} }],
      });
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
