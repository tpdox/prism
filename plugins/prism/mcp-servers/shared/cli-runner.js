import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT = 120_000; // 2 minutes

/**
 * Run a CLI command and collect its output.
 * Returns { stdout, stderr, code }.
 */
export function runCli(command, args = [], options = {}) {
  const { timeout = DEFAULT_TIMEOUT, env, cwd, input } = options;

  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => (stdout += chunk));
    proc.stderr.on("data", (chunk) => (stderr += chunk));

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Command timed out after ${timeout}ms: ${command} ${args.join(" ")}`));
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    if (input) {
      proc.stdin.write(input);
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }
  });
}
