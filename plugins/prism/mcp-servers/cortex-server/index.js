#!/usr/bin/env node

/**
 * Prism Cortex MCP Server
 *
 * Integrates with Snowflake Cortex APIs via key-pair JWT authentication.
 * Exposes three tools:
 *   - cortex_analyst:  Natural language → SQL via semantic models
 *   - cortex_complete: LLM completions using Snowflake-hosted models
 *   - cortex_search:   Query Cortex Search services
 *
 * Requires SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PRIVATE_KEY_PATH.
 */

import { bootstrap } from "../shared/bootstrap.js";
bootstrap(import.meta.url);

import { readFileSync } from "node:fs";
import {
  createPublicKey,
  createHash,
  createSign,
  createPrivateKey,
} from "node:crypto";

const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = await import(
  "@modelcontextprotocol/sdk/server/stdio.js"
);
const { z } = await import("zod");

// --- Configuration ---
const ACCOUNT = process.env.SNOWFLAKE_ACCOUNT;
const USER = process.env.SNOWFLAKE_USER;
const PRIVATE_KEY_PATH = process.env.SNOWFLAKE_PRIVATE_KEY_PATH;
const ROLE = process.env.SNOWFLAKE_ROLE;
const DATABASE = process.env.SNOWFLAKE_DATABASE || "DBT_ANALYTICS_PROD";
const SCHEMA_PREFIX = process.env.SNOWFLAKE_SCHEMA_PREFIX || "ANALYTICS";
const BASE_URL = ACCOUNT
  ? `https://${ACCOUNT}.snowflakecomputing.com`
  : null;

// Owner.com semantic model mapping (6 domains from dbt-cloud Cortex Agent config)
const SEMANTIC_MODELS = {
  billing: `${DATABASE}.${SCHEMA_PREFIX}_BILLING.BILLING_SEMANTIC_VIEW`,
  gtm: `${DATABASE}.${SCHEMA_PREFIX}_GTM.GTM_SEMANTIC_VIEW`,
  support: `${DATABASE}.${SCHEMA_PREFIX}_SUPPORT_CASES.SUPPORT_CASES_SEMANTIC_VIEW`,
  accounts: `${DATABASE}.${SCHEMA_PREFIX}_ACCOUNTS.ACCOUNTS_SEMANTIC_VIEW`,
  product: `${DATABASE}.${SCHEMA_PREFIX}_PRODUCT.PRODUCT_SEMANTIC_VIEW`,
  finance: `${DATABASE}.${SCHEMA_PREFIX}_FINANCE.FINANCE_SEMANTIC_VIEW`,
};

// Domain auto-routing keywords
const DOMAIN_KEYWORDS = {
  billing: [
    "arr", "mrr", "revenue", "subscription fee", "transaction fee",
    "billing", "invoice", "payment",
  ],
  gtm: [
    "funnel", "pipeline", "aql", "conversion rate", "sales stage",
    "prospect", "closed won", "opportunity", "egmv", "emrr", "super aql",
  ],
  support: [
    "support case", "phone call", "sla", "csat", "abandonment",
    "first response", "repeat case", "customer satisfaction",
  ],
  accounts: [
    "churn", "save rate", "cancellation", "retention",
    "account health", "revenue at risk",
  ],
  product: [
    "gmv", "order count", "session", "product conversion", "customer",
    "guest", "location performance", "brand analytics",
  ],
  finance: [
    "cohort", "lifecycle", "launch", "reactivation", "upgrade",
    "downgrade", "data tape", "pricing", "discount", "flex", "coupon",
    "subscription count",
  ],
};

// --- JWT Authentication (key-pair, native Node crypto) ---
let jwtCache = null;

function getJWT() {
  if (!PRIVATE_KEY_PATH || !ACCOUNT || !USER) {
    throw new Error(
      "Missing Snowflake credentials. Set SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, and SNOWFLAKE_PRIVATE_KEY_PATH."
    );
  }

  const now = Math.floor(Date.now() / 1000);
  if (jwtCache && jwtCache.exp - now > 300) return jwtCache.token;

  const privateKeyPem = readFileSync(PRIVATE_KEY_PATH, "utf8");
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(privateKey);

  // SHA-256 fingerprint of DER-encoded public key
  const publicKeyDer = publicKey.export({ type: "spki", format: "der" });
  const fingerprint = createHash("sha256")
    .update(publicKeyDer)
    .digest("base64");

  const accountUpper = ACCOUNT.toUpperCase();
  const userUpper = USER.toUpperCase();
  const exp = now + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: `${accountUpper}.${userUpper}.SHA256:${fingerprint}`,
    sub: `${accountUpper}.${userUpper}`,
    iat: now,
    exp,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(privateKey, "base64url");

  const token = `${signingInput}.${signature}`;
  jwtCache = { token, exp };
  return token;
}

// --- API Helpers ---

async function snowflakePost(path, body) {
  if (!BASE_URL) throw new Error("SNOWFLAKE_ACCOUNT not set.");

  const token = getJWT();
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
  };
  if (ROLE) headers["X-Snowflake-Role"] = ROLE;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Snowflake API error (${res.status}): ${err}`);
  }

  // Handle SSE streaming responses
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    const chunks = [];
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") break;
        try { chunks.push(JSON.parse(data)); } catch { /* skip */ }
      }
    }
    return chunks;
  }

  return res.json();
}

function routeDomain(question) {
  const q = question.toLowerCase();
  let bestDomain = "billing";
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (q.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }
  return bestDomain;
}

// --- MCP Server ---

const server = new McpServer({ name: "prism-cortex", version: "1.0.0" });

// Tool 1: Cortex Analyst — Natural language → SQL via semantic models
server.tool(
  "cortex_analyst",
  "Query Owner.com data using natural language via Snowflake Cortex Analyst. " +
    "Converts questions to SQL using semantic models across 6 domains: " +
    "billing, GTM funnel, support cases, accounts, product, and finance.",
  {
    question: z.string().describe(
      "Natural language question about Owner.com data (e.g., 'What is our current ARR?')"
    ),
    domain: z
      .enum(["billing", "gtm", "support", "accounts", "product", "finance"])
      .optional()
      .describe("Data domain to query. Auto-detected from question if not specified."),
    semantic_model_file: z.string().optional().describe(
      "Override: stage path (@DB.SCHEMA.STAGE/model.yaml) or semantic view FQN (DB.SCHEMA.VIEW)"
    ),
  },
  async ({ question, domain, semantic_model_file }) => {
    try {
      const resolvedDomain = domain || routeDomain(question);
      const semanticModel = semantic_model_file || SEMANTIC_MODELS[resolvedDomain];

      // Build request body — use semantic_model_file for stage refs, semantic_view for view refs
      const body = {
        messages: [{ role: "user", content: [{ type: "text", text: question }] }],
      };
      if (semanticModel.startsWith("@")) {
        body.semantic_model_file = semanticModel;
      } else {
        body.semantic_view = semanticModel;
      }

      const data = await snowflakePost("/api/v2/cortex/analyst/message", body);

      // Extract text and SQL from response (handles both SSE array and JSON)
      let textAnswer = "";
      let sqlQuery = "";
      let suggestions = [];

      const extract = (content) => {
        if (!Array.isArray(content)) return;
        for (const part of content) {
          if (part.type === "text" && part.text) textAnswer += part.text;
          if (part.type === "sql") sqlQuery = part.statement || part.text || "";
          if (part.type === "suggestions") suggestions = part.suggestions || [];
        }
      };

      if (Array.isArray(data)) {
        for (const chunk of data) {
          if (chunk.message?.content) extract(chunk.message.content);
        }
      } else {
        extract(data.message?.content);
        if (data.message?.suggestions) suggestions = data.message.suggestions;
      }

      const output = [
        `**Domain:** ${resolvedDomain}`,
        `**Semantic Model:** ${SEMANTIC_MODELS[resolvedDomain] || semanticModel}`,
        "",
        textAnswer ? `**Answer:** ${textAnswer}` : "(No text response)",
      ];
      if (sqlQuery) {
        output.push("", "**Generated SQL:**", "", "```sql", sqlQuery, "```");
      }
      if (suggestions.length) {
        output.push("", "**Follow-up suggestions:**", ...suggestions.map((s) => `- ${s}`));
      }

      return { content: [{ type: "text", text: output.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Tool 2: Cortex Complete — LLM completions via Snowflake-hosted models
server.tool(
  "cortex_complete",
  "Run LLM completions through Snowflake-hosted models (Claude, Llama, Mistral, etc.). " +
    "Serverless — no warehouse required.",
  {
    prompt: z.string().describe("The prompt to send to the model"),
    model: z.string().optional().describe(
      "Snowflake-hosted model (e.g., 'claude-3-5-sonnet', 'llama3.1-70b', 'mistral-large2'). Default: claude-3-5-sonnet"
    ),
    system: z.string().optional().describe("Optional system message"),
    temperature: z.number().min(0).max(1).optional().describe("Temperature 0-1"),
    max_tokens: z.number().optional().describe("Max output tokens"),
  },
  async ({ prompt, model, system, temperature, max_tokens }) => {
    try {
      const messages = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: prompt });

      const body = { model: model || "claude-3-5-sonnet", messages };
      if (temperature !== undefined) body.temperature = temperature;
      if (max_tokens !== undefined) body.max_tokens = max_tokens;

      const data = await snowflakePost("/api/v2/cortex/inference:complete", body);

      let text = "";
      if (Array.isArray(data)) {
        for (const chunk of data) {
          if (chunk.choices?.[0]?.delta?.content) text += chunk.choices[0].delta.content;
        }
      } else {
        text = data.choices?.[0]?.message?.content
          || data.choices?.[0]?.text
          || JSON.stringify(data);
      }

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Tool 3: Cortex Search — Hybrid semantic + keyword search
server.tool(
  "cortex_search",
  "Search unstructured text data using Snowflake Cortex Search. " +
    "Combines semantic, keyword, and reranking for high-quality retrieval.",
  {
    query: z.string().describe("Search query in natural language"),
    service_name: z.string().describe(
      "Fully qualified Cortex Search service name (DB.SCHEMA.SERVICE_NAME)"
    ),
    columns: z.array(z.string()).optional().describe("Columns to return from search results"),
    limit: z.number().optional().describe("Max results to return (default: 10)"),
  },
  async ({ query, service_name, columns, limit }) => {
    try {
      const parts = service_name.split(".");
      if (parts.length !== 3) {
        throw new Error("service_name must be fully qualified: DB.SCHEMA.SERVICE_NAME");
      }
      const [db, schema, service] = parts;
      const path = `/api/v2/databases/${db}/schemas/${schema}/cortex-search-services/${service}:query`;

      const data = await snowflakePost(path, {
        query,
        columns: columns || [],
        limit: limit || 10,
      });

      const results = data.results || [];
      if (results.length === 0) {
        return { content: [{ type: "text", text: "No results found." }] };
      }

      const output = results
        .map((row, i) => {
          const lines = [`**Result ${i + 1}:**`];
          for (const [key, value] of Object.entries(row)) {
            lines.push(`  ${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
          }
          return lines.join("\n");
        })
        .join("\n\n");

      return { content: [{ type: "text", text: output }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
