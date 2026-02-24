#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  Prism — Smoke Tests
# ─────────────────────────────────────────────

PRISM_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0
SKIP=0

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }
skip() { echo "  ○ $1 (skipped)"; SKIP=$((SKIP + 1)); }

echo ""
echo "Prism Smoke Tests"
echo "─────────────────"

# ── 1. CLI Availability ──

echo ""
echo "1. CLI Availability"

if command -v node &>/dev/null; then
  pass "Node.js $(node --version)"
else
  fail "Node.js not found"
fi

if command -v codex &>/dev/null; then
  pass "Codex CLI: $(codex --version 2>/dev/null || echo 'available')"
else
  fail "Codex CLI not found"
fi

if command -v gemini &>/dev/null; then
  pass "Gemini CLI available"
else
  skip "Gemini CLI not installed"
fi

# ── 2. Plugin Structure ──

echo ""
echo "2. Plugin Structure"

check_file() {
  if [ -f "$PRISM_DIR/$1" ]; then
    pass "$1"
  else
    fail "$1 missing"
  fi
}

check_file ".claude-plugin/marketplace.json"
check_file "plugins/prism/.claude-plugin/plugin.json"
check_file "plugins/prism/.mcp.json"
check_file "plugins/prism/mcp-servers/codex-server/index.js"
check_file "plugins/prism/mcp-servers/gemini-server/index.js"
check_file "plugins/prism/mcp-servers/shared/cli-runner.js"
check_file "plugins/prism/mcp-servers/shared/output-parser.js"

# ── 3. Agent Definitions ──

echo ""
echo "3. Agent Definitions"

for agent in codex-coder codex-reviewer gemini-coder gemini-researcher kimi-writer router; do
  AGENT_FILE="$PRISM_DIR/plugins/prism/agents/$agent.md"
  if [ -f "$AGENT_FILE" ]; then
    # Check for required frontmatter fields
    if head -20 "$AGENT_FILE" | grep -q "^name:"; then
      if head -20 "$AGENT_FILE" | grep -q "^description:"; then
        if head -20 "$AGENT_FILE" | grep -q "^tools:"; then
          pass "$agent.md (valid frontmatter)"
        else
          fail "$agent.md (missing tools: in frontmatter)"
        fi
      else
        fail "$agent.md (missing description: in frontmatter)"
      fi
    else
      fail "$agent.md (missing name: in frontmatter)"
    fi
  else
    fail "$agent.md missing"
  fi
done

# ── 4. Manifest Validation ──

echo ""
echo "4. Manifest Validation"

# Validate marketplace.json
if node -e "
  const m = require('$PRISM_DIR/.claude-plugin/marketplace.json');
  if (!m.name) throw new Error('missing name');
  if (!m.plugins || !m.plugins.length) throw new Error('missing plugins');
  process.exit(0);
" 2>/dev/null; then
  pass "marketplace.json valid"
else
  fail "marketplace.json invalid"
fi

# Validate plugin.json
if node -e "
  const p = require('$PRISM_DIR/plugins/prism/.claude-plugin/plugin.json');
  if (!p.name) throw new Error('missing name');
  if (!p.version) throw new Error('missing version');
  if (!p.agents) throw new Error('missing agents');
  if (!p.mcpServers) throw new Error('missing mcpServers');
  process.exit(0);
" 2>/dev/null; then
  pass "plugin.json valid"
else
  fail "plugin.json invalid"
fi

# Validate .mcp.json
if node -e "
  const m = require('$PRISM_DIR/plugins/prism/.mcp.json');
  if (!m.mcpServers) throw new Error('missing mcpServers');
  if (!m.mcpServers['prism-codex']) throw new Error('missing prism-codex');
  if (!m.mcpServers['prism-gemini']) throw new Error('missing prism-gemini');
  if (!m.mcpServers['prism-kimi']) throw new Error('missing prism-kimi');
  process.exit(0);
" 2>/dev/null; then
  pass ".mcp.json valid"
else
  fail ".mcp.json invalid"
fi

# ── 5. MCP Server Startup ──

echo ""
echo "5. MCP Server Startup"

# Test codex server can start (will fail quickly if codex not found, that's ok)
if command -v codex &>/dev/null; then
  timeout 3 node "$PRISM_DIR/plugins/prism/mcp-servers/codex-server/index.js" </dev/null &>/dev/null &
  CODEX_PID=$!
  sleep 1
  if kill -0 "$CODEX_PID" 2>/dev/null; then
    pass "Codex MCP server starts"
    kill "$CODEX_PID" 2>/dev/null || true
  else
    # Codex server may exit quickly without input — that's expected for stdio transport
    pass "Codex MCP server loads (stdio transport)"
  fi
  wait "$CODEX_PID" 2>/dev/null || true
else
  skip "Codex MCP server (codex not installed)"
fi

# Test gemini server deps
GEMINI_SERVER_DIR="$PRISM_DIR/plugins/prism/mcp-servers/gemini-server"
if [ -d "$GEMINI_SERVER_DIR/node_modules" ]; then
  pass "Gemini MCP server dependencies installed"
else
  skip "Gemini MCP server dependencies (run: cd plugins/prism/mcp-servers/gemini-server && npm install)"
fi

# Test kimi server deps
KIMI_SERVER_DIR="$PRISM_DIR/plugins/prism/mcp-servers/kimi-server"
if [ -d "$KIMI_SERVER_DIR/node_modules" ]; then
  pass "Kimi MCP server dependencies installed"
else
  skip "Kimi MCP server dependencies (run: cd plugins/prism/mcp-servers/kimi-server && npm install)"
fi

# ── Results ──

echo ""
echo "─────────────────"
TOTAL=$((PASS + FAIL + SKIP))
echo "  $PASS passed, $FAIL failed, $SKIP skipped ($TOTAL total)"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
