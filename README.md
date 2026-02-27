<div align="center">

# Prism

**Multi-model AI orchestration for Claude Code.**

Split a single request across multiple AI models — like light through a prism.

Delegate coding to Codex. Research to Gemini. Writing to Kimi.<br>
Or let the router pick for you.

[Install](#install) · [Agents](#agents) · [Debate](#-debate) · [MCP Tools](#mcp-tools) · [Architecture](#architecture)

</div>

---

## Why Prism?

Different models are good at different things. Codex is fast at focused code. Gemini has Google Search and a million-token context window. Kimi writes prose that doesn't sound like a robot.

Prism gives Claude Code the ability to delegate to all of them — through 7 specialized agents and 9 MCP tools — without leaving your terminal.

```
You: Use the router to research Click best practices and then write a CLI tool

Router → gemini-researcher (research) → codex-coder (implementation)
```

## Install

```
claude plugin add tpdox-prism/prism
```

### Prerequisites

You don't need all three providers — just set up the ones you want.

**Codex (OpenAI)** — for code implementation and review
```bash
npm install -g @openai/codex
export OPENAI_API_KEY="sk-..."   # https://platform.openai.com/api-keys
```

**Gemini (Google)** — for research and large-context analysis
```bash
npm install -g @google/gemini-cli
export GOOGLE_API_KEY="AIza..."  # https://aistudio.google.com/apikey
```

**Kimi (Moonshot)** — for polished writing and documentation
```bash
# No CLI needed — Prism calls the API directly
export MOONSHOT_API_KEY="sk-..."  # https://platform.moonshot.ai/
```

## Agents

### `prism:router`
> *Auto-routes to the optimal model based on your task.*

The router analyzes what you're asking for and delegates to the right agent. You don't need to think about which model to use.

| Task type | Routes to |
|-----------|-----------|
| "Write a function that..." | `codex-coder` |
| "Review this code for..." | `codex-reviewer` |
| "Research how to..." | `gemini-researcher` |
| "Generate a multi-file..." | `gemini-coder` |
| "Write a README for..." | `kimi-writer` |
| "Debate whether..." | `debate` |

```
You: Use the router to write a retry utility with exponential backoff
     → Routes to codex-coder → returns implementation from Codex
```

---

### `prism:codex-coder`
> *Delegate code implementation to OpenAI Codex.*

Best for quick, focused implementations. Codex runs in a sandbox, so the code is tested before you see it.

```
You: Use codex-coder to write a Python linked list reversal
     → Gathers codebase context → sends to Codex → returns implementation
```

---

### `prism:codex-reviewer`
> *Get an independent code review from a different model.*

A second opinion from Codex. Catches bugs Claude might miss because it's looking at the code with fresh eyes.

```
You: Use codex-reviewer to review my last commit
     → Collects diff → sends to Codex in read-only sandbox → returns findings by severity
```

---

### `prism:gemini-researcher`
> *Research with Google Search grounding and 1M token context.*

When you need current information, API docs, or library comparisons. Gemini searches the web and cites sources.

```
You: Use gemini-researcher to research rate limiting patterns for Express.js
     → Gemini searches the web → returns findings with citations
```

---

### `prism:gemini-coder`
> *Multi-file code generation with Gemini's large context window.*

Feed it an entire module and ask for changes. Gemini can hold 1M tokens of context — whole codebases fit.

---

### `prism:kimi-writer`
> *Polished prose from Kimi (Moonshot AI).*

READMEs, blog posts, changelogs, documentation. Kimi's writing doesn't have that "obviously AI" feel.

```
You: Use kimi-writer to write a changelog for our v2.0 release
     → Reads git history → sends to Kimi → returns polished changelog
```

---

### `prism:debate`
> *Pit Codex, Gemini, and Kimi against each other.*

This is the fun one. Pick any topic and watch three AI models argue about it across multiple rounds, each with a distinct personality.

## The Debate

Each model gets a personality:

- **Codex** — The pragmatist. Terse, opinionated, ships-first. Will include code snippets to prove a point.
- **Gemini** — The researcher. Cites sources, considers edge cases, will "well actually" the others.
- **Kimi** — The eloquent contrarian. Philosophical takes, unexpected angles, will reframe the entire debate.

**Format:** Opening statements → Clash rounds (models respond to each other directly) → Verdict with scoreboard

### Example: "Is tabs or spaces better for code indentation?"

**Codex** opened with the pragmatist take:
> *"Tabs optimize for ideology; spaces optimize for throughput. I care about what survives CI, code review, and 3am hotfixes."*

**Gemini** dismantled it with evidence:
> *"Codex's 'determinism' point is right in spirit, but wrong in target: determinism comes from tooling, not from choosing spaces."*

**Kimi** reframed everything:
> *"Spaces are a polite lie. They pretend indentation is content when it is really display. A tab admits this honestly."*

**Winner: Gemini** — the only debater who distinguished between language-constrained files and everything else, cited real tooling behavior (gofmt, PEP 8, TabError, YAML), and proposed a framework that works across a polyglot repo.

```
You: Use the debate agent to debate: monorepo vs polyrepo
```

## MCP Tools

These tools are available to any agent or directly in your Claude Code session:

**Gemini**
| Tool | Description |
|------|-------------|
| `gemini_generate` | Text and code generation |
| `gemini_analyze` | Large-context analysis (1M tokens) |
| `gemini_research` | Web-grounded research with Google Search |

**Kimi**
| Tool | Description |
|------|-------------|
| `kimi_write` | Polished prose and documentation |
| `kimi_generate` | General text and code generation |
| `kimi_analyze` | Large-context analysis (256K tokens) |

**Codex**
| Tool | Description |
|------|-------------|
| `codex` | Full Codex session with sandboxed execution |

## Architecture

```
┌─────────────────────────────────────────────┐
│                 Claude Code                  │
│                                             │
│   Task(subagent_type="prism:router")        │
│         │                                   │
│         ▼                                   │
│   ┌─────────┐                               │
│   │ Router  │──analyze──▶ pick best agent   │
│   └────┬────┘                               │
│        │                                    │
│   ┌────┴──────────────┬──────────────┐      │
│   ▼                   ▼              ▼      │
│ codex-coder    gemini-researcher  kimi-writer│
│ codex-reviewer gemini-coder       debate    │
│   │                   │              │      │
│   ▼                   ▼              ▼      │
│ ┌──────────┐  ┌────────────┐  ┌──────────┐ │
│ │Codex MCP │  │Gemini MCP  │  │ Kimi MCP │ │
│ │ Server   │  │  Server    │  │  Server  │ │
│ └────┬─────┘  └─────┬──────┘  └────┬─────┘ │
└──────┼──────────────┼──────────────┼────────┘
       ▼              ▼              ▼
   codex CLI     gemini CLI    Moonshot API
   (OpenAI)      (Google)      (Kimi)
```

- **Codex MCP Server** — Thin passthrough to `codex mcp-server` (Codex has native MCP support)
- **Gemini MCP Server** — Wraps `gemini` CLI with JSON output parsing and API key bridging
- **Kimi MCP Server** — Direct HTTP to Moonshot's OpenAI-compatible API endpoint
- **Shared utilities** — Bootstrap (auto-installs deps), CLI runner (child process with timeout), output parsers

## Adding a Provider

Prism is designed to be extended. To add a new model:

1. Create `mcp-servers/<provider>-server/index.js` — wrap the CLI or API
2. Create `agents/<provider>-<role>.md` — define the agent's tools, personality, and workflow
3. Add the server to `.mcp.json`
4. Add routing rules to `router.md`
5. Bump version and push

## Update / Uninstall

```bash
# Update
claude plugin update tpdox-prism/prism

# Uninstall
claude plugin remove tpdox-prism/prism
```

## License

MIT
