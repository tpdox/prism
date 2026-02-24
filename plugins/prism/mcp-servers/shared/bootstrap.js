/**
 * Auto-install node_modules on first run.
 * Needed because the Claude Code plugin cache doesn't run npm install.
 */

import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function bootstrap(importMetaUrl) {
  const serverDir = dirname(fileURLToPath(importMetaUrl));
  const nodeModules = join(serverDir, "node_modules");

  if (!existsSync(nodeModules)) {
    process.stderr.write(`[prism] First run — installing dependencies in ${serverDir}...\n`);
    try {
      execSync("npm install --omit=dev", { cwd: serverDir, stdio: "pipe" });
      process.stderr.write("[prism] Dependencies installed.\n");
    } catch (err) {
      process.stderr.write(`[prism] Failed to install dependencies: ${err.message}\n`);
      process.stderr.write("[prism] Run manually: cd " + serverDir + " && npm install\n");
      process.exit(1);
    }
  }
}
