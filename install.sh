#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  Prism — Multi-Model AI Orchestration
#  Install script for Claude Desktop / manual setup
# ─────────────────────────────────────────────

PRISM_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  ██████╗ ██████╗ ██╗███████╗███╗   ███╗"
echo "  ██╔══██╗██╔══██╗██║██╔════╝████╗ ████║"
echo "  ██████╔╝██████╔╝██║███████╗██╔████╔██║"
echo "  ██╔═══╝ ██╔══██╗██║╚════██║██║╚██╔╝██║"
echo "  ██║     ██║  ██║██║███████║██║ ╚═╝ ██║"
echo "  ╚═╝     ╚═╝  ╚═╝╚═╝╚══════╝╚═╝     ╚═╝"
echo ""
echo "  Multi-Model AI Orchestration"
echo "  Codex · Gemini · and more"
echo ""
echo "────────────────────────────────────────────"

# ── Helper functions ──

ok()   { echo "  ✓ $1"; }
warn() { echo "  ⚠ $1"; }
fail() { echo "  ✗ $1"; exit 1; }

check_command() {
  command -v "$1" &>/dev/null
}

# ── Step 1: Check Node.js ──

echo ""
echo "Step 1/5: Checking prerequisites..."

if ! check_command node; then
  fail "Node.js is required. Install from https://nodejs.org"
fi
ok "Node.js $(node --version)"

if ! check_command npm; then
  fail "npm is required. Install Node.js from https://nodejs.org"
fi
ok "npm $(npm --version)"

# ── Step 2: Check/install Codex CLI ──

echo ""
echo "Step 2/5: Checking Codex CLI..."

if check_command codex; then
  ok "Codex CLI found: $(codex --version 2>/dev/null || echo 'installed')"
else
  warn "Codex CLI not found"
  read -rp "  Install now? (npm install -g @openai/codex) [Y/n] " yn
  case "${yn:-Y}" in
    [Yy]*) npm install -g @openai/codex && ok "Codex CLI installed" ;;
    *)     warn "Skipping Codex CLI — codex agents will not work" ;;
  esac
fi

# Check Codex auth
if check_command codex; then
  if [ -z "${CODEX_API_KEY:-}" ] && [ -z "${OPENAI_API_KEY:-}" ]; then
    warn "No OpenAI API key found in environment"
    echo "  Run 'codex login' or set OPENAI_API_KEY / CODEX_API_KEY"
  else
    ok "OpenAI API key configured"
  fi
fi

# ── Step 3: Check/install Gemini CLI ──

echo ""
echo "Step 3/5: Checking Gemini CLI..."

if check_command gemini; then
  ok "Gemini CLI found"
else
  warn "Gemini CLI not found"
  read -rp "  Install now? (npm install -g @google/gemini-cli) [Y/n] " yn
  case "${yn:-Y}" in
    [Yy]*) npm install -g @google/gemini-cli && ok "Gemini CLI installed" ;;
    *)     warn "Skipping Gemini CLI — gemini agents will not work" ;;
  esac
fi

# Check Gemini auth
if [ -z "${GOOGLE_API_KEY:-}" ]; then
  warn "No GOOGLE_API_KEY found in environment"
  echo "  Get one at: https://aistudio.google.com/apikey"
  echo "  Then: export GOOGLE_API_KEY=your-key"
else
  ok "GOOGLE_API_KEY configured"
fi

# ── Step 4: Check Kimi API key ──

echo ""
echo "Step 4/7: Checking Kimi (Moonshot AI)..."

if [ -z "${MOONSHOT_API_KEY:-}" ]; then
  warn "No MOONSHOT_API_KEY found in environment"
  echo "  Get one at: https://platform.moonshot.ai/"
  echo "  Then: export MOONSHOT_API_KEY=your-key"
else
  ok "MOONSHOT_API_KEY configured"
fi

# ── Step 5: Install MCP server dependencies ──

echo ""
echo "Step 5/7: Installing dependencies..."

cd "$PRISM_DIR/plugins/prism/mcp-servers/gemini-server"
npm install --production --silent 2>/dev/null && ok "Gemini MCP server dependencies installed" || warn "Failed to install Gemini server deps"

cd "$PRISM_DIR/plugins/prism/mcp-servers/kimi-server"
npm install --production --silent 2>/dev/null && ok "Kimi MCP server dependencies installed" || warn "Failed to install Kimi server deps"

# ── Step 6: Configure Claude Desktop ──

echo ""
echo "Step 6/7: Configuring Claude Desktop..."

CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
CLAUDE_CONFIG_DIR="$(dirname "$CLAUDE_CONFIG")"

if [ ! -d "$CLAUDE_CONFIG_DIR" ]; then
  warn "Claude Desktop config directory not found"
  echo "  Skipping Claude Desktop configuration"
  echo "  If you install Claude Desktop later, re-run this script"
else
  # Back up existing config
  if [ -f "$CLAUDE_CONFIG" ]; then
    cp "$CLAUDE_CONFIG" "$CLAUDE_CONFIG.bak.$(date +%s)"
    ok "Backed up existing config"
  fi

  # Build MCP server entries
  CODEX_SERVER="$PRISM_DIR/plugins/prism/mcp-servers/codex-server/index.js"
  GEMINI_SERVER="$PRISM_DIR/plugins/prism/mcp-servers/gemini-server/index.js"

  if [ -f "$CLAUDE_CONFIG" ]; then
    # Merge into existing config using node
    node -e "
      const fs = require('fs');
      const config = JSON.parse(fs.readFileSync('$CLAUDE_CONFIG', 'utf8'));
      if (!config.mcpServers) config.mcpServers = {};
      config.mcpServers['prism-codex'] = {
        command: 'node',
        args: ['$CODEX_SERVER']
      };
      config.mcpServers['prism-gemini'] = {
        command: 'node',
        args: ['$GEMINI_SERVER']
      };
      config.mcpServers['prism-kimi'] = {
        command: 'node',
        args: ['$PRISM_DIR/plugins/prism/mcp-servers/kimi-server/index.js']
      };
      fs.writeFileSync('$CLAUDE_CONFIG', JSON.stringify(config, null, 2));
    " && ok "Added Prism MCP servers to Claude Desktop config"
  else
    # Create new config
    node -e "
      const fs = require('fs');
      const config = {
        mcpServers: {
          'prism-codex': {
            command: 'node',
            args: ['$CODEX_SERVER']
          },
          'prism-gemini': {
            command: 'node',
            args: ['$GEMINI_SERVER']
          },
          'prism-kimi': {
            command: 'node',
            args: ['$PRISM_DIR/plugins/prism/mcp-servers/kimi-server/index.js']
          }
        }
      };
      fs.writeFileSync('$CLAUDE_CONFIG', JSON.stringify(config, null, 2));
    " && ok "Created Claude Desktop config with Prism MCP servers"
  fi
fi

# ── Done ──

echo ""
echo "────────────────────────────────────────────"
echo ""
echo "  Prism installed!"
echo ""
echo "  MCP servers configured:"
echo "    • prism-codex  → Codex CLI wrapper"
echo "    • prism-gemini → Gemini CLI wrapper"
echo "    • prism-kimi   → Kimi API wrapper"
echo ""
echo "  Usage in Claude Desktop:"
echo "    Ask Claude to use the gemini_research or"
echo "    gemini_analyze tools — they're now available"
echo "    as MCP tools in your conversations."
echo ""
echo "  For Claude Code (recommended):"
echo "    claude plugin marketplace add Owner/prism"
echo "    claude plugin install prism@Owner-prism --scope user"
echo ""
echo "────────────────────────────────────────────"
