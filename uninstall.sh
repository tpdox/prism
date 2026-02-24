#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  Prism — Uninstall (manual / Claude Desktop)
# ─────────────────────────────────────────────

echo ""
echo "Uninstalling Prism..."
echo ""

CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"

if [ -f "$CLAUDE_CONFIG" ]; then
  # Back up config
  cp "$CLAUDE_CONFIG" "$CLAUDE_CONFIG.bak.$(date +%s)"

  # Remove Prism MCP servers from Claude Desktop config
  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('$CLAUDE_CONFIG', 'utf8'));
    if (config.mcpServers) {
      delete config.mcpServers['prism-codex'];
      delete config.mcpServers['prism-gemini'];
    }
    fs.writeFileSync('$CLAUDE_CONFIG', JSON.stringify(config, null, 2));
  " && echo "  ✓ Removed Prism MCP servers from Claude Desktop config"
else
  echo "  ⚠ Claude Desktop config not found — nothing to remove"
fi

echo ""
echo "  For Claude Code plugin:"
echo "    claude plugin uninstall prism@Owner-prism"
echo ""
echo "  Done. Restart Claude Desktop to complete removal."
echo ""
