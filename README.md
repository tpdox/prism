# Prism

**Multi-model AI orchestration for Claude Code.** Split a single request into multiple model perspectives — like light through a prism. Delegate tasks to OpenAI Codex, Google Gemini, Kimi, and any future LLM.

## Install

**Claude Code (recommended):**

```
claude plugin marketplace add Owner/prism
claude plugin install prism@Owner-prism --scope user
```

**Claude Desktop (MCP tools only):**

```bash
git clone https://github.com/Owner/prism.git ~/prism
cd ~/prism && ./install.sh
```

### Prerequisites

| Provider | Install | Auth |
|----------|---------|------|
| Codex | `npm install -g @openai/codex` | `codex login` or set `OPENAI_API_KEY` |
| Gemini | `npm install -g @google/gemini-cli` | Set `GOOGLE_API_KEY` ([get key](https://aistudio.google.com/apikey)) |
| Kimi | No CLI needed (API only) | Set `MOONSHOT_API_KEY` ([get key](https://platform.moonshot.ai/)) |

## Agents

| Agent | Delegates To | Best For |
|-------|-------------|----------|
| `codex-coder` | Codex CLI | Quick implementations, sandbox-tested code |
| `codex-reviewer` | Codex CLI | Independent code review, second opinions |
| `gemini-researcher` | Gemini CLI | API docs, web research, large-context analysis |
| `gemini-coder` | Gemini CLI | Multi-file generation, research-informed code |
| `kimi-writer` | Kimi API | Polished writing, docs, READMEs, blog posts |
| `router` | Any agent | Auto-routes to optimal model by task type |

## Usage

From any directory in Claude Code:

```
You: "Use the codex-coder agent to write a Redis cache wrapper"

You: "Use the gemini-researcher agent to research rate limiting patterns"

You: "Use the router to review my last commit"
```

## MCP Tools

Available in both Claude Code and Claude Desktop:

| Tool | Description |
|------|-------------|
| `gemini_generate` | Text/code generation via Gemini |
| `gemini_analyze` | Large-context analysis (1M tokens) |
| `gemini_research` | Web-grounded research with Google Search |
| `kimi_write` | Polished prose and documentation via Kimi |
| `kimi_generate` | General text/code generation via Kimi |
| `kimi_analyze` | Large-context analysis (256K) via Kimi |
| Codex tools | Exposed via `codex mcp-server` (built-in) |

## Adding Providers

1. Create `plugins/prism/mcp-servers/<provider>-server/`
2. Create `plugins/prism/agents/<provider>-<role>.md`
3. Add server to `plugins/prism/.mcp.json`
4. Add routing rules to `router.md`
5. Bump version, push — users run `claude plugin update`

## Update / Uninstall

```bash
# Update (Claude Code)
claude plugin update prism@Owner-prism

# Uninstall (Claude Code)
claude plugin uninstall prism@Owner-prism

# Uninstall (manual)
./uninstall.sh
```

## License

MIT
